"""P4-01 acceptance: knowledge entries, their statuses, provenance and the graph.

The rules worth pinning are the three that decide whether a learner can trust a badge:
a core entry never arrives already confirmed, editing a confirmed one sends it back for
review, and confirming is a separate act that stamps its own time.
"""



def _project(client, name="Knowledge Project"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def _create(client, project_id, **overrides):
    payload = {
        "title": "Broadcasting aligns trailing dimensions",
        "body": "A size-1 dimension is stretched to match the other operand.",
        "kind": "note",
    }
    payload.update(overrides)
    return client.post(f"/api/projects/{project_id}/knowledge", json=payload)


def test_a_note_is_saved_as_a_draft_with_its_provenance(client):
    project_id = _project(client)
    response = _create(
        client,
        project_id,
        source_kind="exploration",
        provenance=[
            {
                "kind": "exploration",
                "session_id": 3,
                "message_id": 9,
                "filename": "notes.md",
                "locator": "p.2",
            }
        ],
    )
    assert response.status_code == 201
    body = response.json()

    assert body["status"] == "draft"
    assert body["kind"] == "note"
    assert body["source_kind"] == "exploration"
    assert body["confirmed_at"] is None
    assert body["provenance"] == [
        {
            "kind": "exploration",
            "session_id": 3,
            "message_id": 9,
            "filename": "notes.md",
            "locator": "p.2",
        }
    ]
    assert [project["project_id"] for project in body["projects"]] == [project_id]

    listed = client.get(f"/api/projects/{project_id}/knowledge").json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == body["id"]


def test_provenance_is_a_bounded_snapshot_not_a_free_form_bag(client):
    """Two halves of the same rule, and they differ on purpose.

    A request carrying a field the snapshot does not define is refused, like every other
    endpoint in this app: silently accepting unknown input is how a contract rots. The
    normaliser still drops unknown keys, because its other caller is the server itself,
    building provenance from its own rows.
    """
    from app.knowledge.service import normalize_provenance

    project_id = _project(client)
    refused = _create(
        client,
        project_id,
        provenance=[{"kind": "resource", "filename": "a.pdf", "internal_note": "no"}],
    )
    assert refused.status_code == 422

    assert normalize_provenance(
        [{"kind": "resource", "filename": "a.pdf", "secret": "x", "locator": "p.1"}]
    ) == [{"kind": "resource", "filename": "a.pdf", "locator": "p.1"}]
    # The cap is a cap: a hundred items do not become a hundred stored items.
    many = normalize_provenance([{"filename": f"f{index}.pdf"} for index in range(100)])
    assert len(many) == 20


def test_a_core_entry_arrives_pending_review_not_confirmed(client):
    project_id = _project(client)
    body = _create(client, project_id, kind="definition").json()
    assert body["status"] == "pending_review"

    standard = _create(client, project_id, kind="standard_answer").json()
    assert standard["status"] == "pending_review"

    # And it is not confirmed until somebody confirms it.
    assert standard["confirmed_at"] is None


def test_confirming_stamps_the_time_and_is_idempotent(client):
    project_id = _project(client)
    entry_id = _create(client, project_id, kind="definition").json()["id"]

    first = client.post(f"/api/knowledge/{entry_id}/confirm").json()
    assert first["status"] == "confirmed"
    assert first["confirmed_at"] is not None

    second = client.post(f"/api/knowledge/{entry_id}/confirm").json()
    assert second["status"] == "confirmed"
    # Confirming again must not move the stamp: it records when this was settled, not
    # when somebody last pressed the button.
    assert second["confirmed_at"] == first["confirmed_at"]


def test_editing_a_confirmed_entry_sends_it_back_for_review(client):
    project_id = _project(client)
    entry_id = _create(client, project_id, kind="definition").json()["id"]
    client.post(f"/api/knowledge/{entry_id}/confirm")

    response = client.patch(
        f"/api/knowledge/{entry_id}", json={"body": "A corrected definition."}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending_review"
    assert body["confirmed_at"] is None
    assert body["sent_back_for_review"] is True
    assert body["body"] == "A corrected definition."


def test_an_edit_that_changes_nothing_leaves_a_confirmed_entry_confirmed(client):
    """The flag is about the entry changing, not about a request arriving."""
    project_id = _project(client)
    entry_id = _create(client, project_id, kind="definition", title="Rank").json()["id"]
    confirmed = client.post(f"/api/knowledge/{entry_id}/confirm").json()

    response = client.patch(f"/api/knowledge/{entry_id}", json={"title": "Rank"})
    body = response.json()
    assert body["status"] == "confirmed"
    assert body["confirmed_at"] == confirmed["confirmed_at"]
    assert body["sent_back_for_review"] is False


def test_promoting_a_note_to_a_definition_makes_it_wait_for_review(client):
    project_id = _project(client)
    entry_id = _create(client, project_id).json()["id"]
    assert client.get(f"/api/knowledge/{entry_id}").json()["status"] == "draft"

    body = client.patch(f"/api/knowledge/{entry_id}", json={"kind": "definition"}).json()
    assert body["kind"] == "definition"
    assert body["status"] == "pending_review"


def test_an_archived_project_is_read_only_for_its_knowledge(client):
    project_id = _project(client)
    entry_id = _create(client, project_id).json()["id"]
    assert client.post(f"/api/projects/{project_id}/archive").status_code in (200, 204)

    assert _create(client, project_id).status_code == 409
    patched = client.patch(f"/api/knowledge/{entry_id}", json={"body": "changed"})
    assert patched.status_code == 409
    assert patched.json()["detail"]["error"] == "project_archived"
    # Reading still works: an archive is a freeze, not a deletion.
    assert client.get(f"/api/knowledge/{entry_id}").status_code == 200


def test_an_empty_entry_is_refused(client):
    project_id = _project(client)
    assert _create(client, project_id, title="   ").status_code == 422
    assert _create(client, project_id, body="   ").status_code == 422


def test_the_list_can_be_filtered_by_status(client):
    project_id = _project(client)
    _create(client, project_id)
    core = _create(client, project_id, kind="definition").json()
    client.post(f"/api/knowledge/{core['id']}/confirm")

    drafts = client.get(f"/api/projects/{project_id}/knowledge", params={"status": "draft"}).json()
    assert drafts["total"] == 1
    confirmed = client.get(
        f"/api/projects/{project_id}/knowledge", params={"status": "confirmed"}
    ).json()
    assert [item["id"] for item in confirmed["items"]] == [core["id"]]
    assert (
        client.get(
            f"/api/projects/{project_id}/knowledge", params={"status": "nonsense"}
        ).status_code
        == 422
    )


def test_a_prerequisite_cycle_is_refused(client):
    project_id = _project(client)
    first = _create(client, project_id, title="Tensors").json()["id"]
    second = _create(client, project_id, title="Broadcasting").json()["id"]

    created = client.post(
        f"/api/knowledge/{first}/relations", json={"to_id": second, "kind": "prerequisite"}
    )
    assert created.status_code == 201

    cycle = client.post(
        f"/api/knowledge/{second}/relations", json={"to_id": first, "kind": "prerequisite"}
    )
    assert cycle.status_code == 409
    assert cycle.json()["detail"]["error"] == "prerequisite_cycle"

    # The first edge is intact; a refused write changes nothing.
    detail = client.get(f"/api/knowledge/{second}").json()
    assert [edge["from_id"] for edge in detail["prerequisites"]] == [first]


def test_a_mutual_related_pair_is_allowed_because_it_is_a_statement(client):
    project_id = _project(client)
    first = _create(client, project_id, title="A").json()["id"]
    second = _create(client, project_id, title="B").json()["id"]

    assert (
        client.post(
            f"/api/knowledge/{first}/relations", json={"to_id": second, "kind": "related"}
        ).status_code
        == 201
    )
    assert (
        client.post(
            f"/api/knowledge/{second}/relations", json={"to_id": first, "kind": "related"}
        ).status_code
        == 201
    )


def test_an_entry_cannot_relate_to_itself(client):
    project_id = _project(client)
    entry_id = _create(client, project_id).json()["id"]
    response = client.post(
        f"/api/knowledge/{entry_id}/relations", json={"to_id": entry_id, "kind": "related"}
    )
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "self_relation"


def test_another_project_can_reference_an_entry_without_owning_it(client):
    owner = _project(client, "Owner Project")
    reader = _project(client, "Reader Project")
    entry_id = _create(client, owner).json()["id"]

    linked = client.post(f"/api/knowledge/{entry_id}/projects", json={"project_id": reader})
    assert linked.status_code == 201
    assert {project["project_id"] for project in linked.json()} == {owner, reader}

    # It now shows in the reader's list, and its owner did not change.
    listed = client.get(f"/api/projects/{reader}/knowledge").json()
    assert [item["id"] for item in listed["items"]] == [entry_id]
    assert client.get(f"/api/knowledge/{entry_id}").json()["project_id"] == owner

    # Linking twice is a no-op rather than a duplicate row.
    again = client.post(f"/api/knowledge/{entry_id}/projects", json={"project_id": reader})
    assert len(again.json()) == 2


def test_a_missing_entry_is_a_404(client):
    assert client.get("/api/knowledge/999999").status_code == 404
    assert (
        client.patch("/api/knowledge/999999", json={"body": "x"}).json()["detail"]["error"]
        == "knowledge_not_found"
    )


# --------------------------------------------------------------------------
# P4-02: a grounded answer becomes a draft, and repeats are noticed
# --------------------------------------------------------------------------


def _session_with_answer(
    client, project_id, *, question="Why does broadcasting align trailing dimensions?",
    body="A size-1 dimension is stretched to match the other operand.",
    beyond=None, grounded=True,
):
    """Seed a conversation the way the agent endpoints would, then return its ids."""
    from app.agent.models import AgentMessage, AgentSession
    from app.db import SessionLocal

    with SessionLocal() as session:
        conversation = AgentSession(project_id=project_id, mode="explore", title=question)
        session.add(conversation)
        session.flush()
        asked = AgentMessage(session_id=conversation.id, role="user", body=question)
        answered = AgentMessage(
            session_id=conversation.id,
            role="assistant",
            body=body,
            beyond=beyond,
            grounded=1 if grounded else 0,
            source_refs=(
                [
                    {
                        "marker": "S1",
                        "chunk_id": 4,
                        "resource_id": 2,
                        "filename": "notes.md",
                        "locator": "p.3",
                    }
                ]
                if grounded
                else []
            ),
        )
        session.add_all([asked, answered])
        session.commit()
        return conversation.id, answered.id


def _draft(client, project_id, session_id, message_id):
    return client.post(
        f"/api/projects/{project_id}/knowledge/drafts",
        json={"session_id": session_id, "message_id": message_id},
    )


def test_a_grounded_answer_becomes_a_draft_with_its_citations(client):
    project_id = _project(client)
    session_id, message_id = _session_with_answer(client, project_id)

    response = _draft(client, project_id, session_id, message_id)
    assert response.status_code == 201
    body = response.json()

    entry = body["entry"]
    assert entry["status"] == "draft"
    assert entry["kind"] == "note"
    assert entry["source_kind"] == "exploration"
    assert entry["title"] == "Why does broadcasting align trailing dimensions?"
    assert entry["body"].startswith("A size-1 dimension")
    # The ungrounded half is NOT promoted into a note, even when it exists.
    assert "beyond" not in entry
    assert {item["kind"] for item in entry["provenance"]} == {"exploration", "resource"}
    assert entry["provenance"][1]["filename"] == "notes.md"
    assert body["duplicate_of"] is None


def test_an_ungrounded_answer_is_refused_with_a_reason(client):
    """A note is where "we checked this" is implied, so general knowledge stays out."""
    project_id = _project(client)
    session_id, message_id = _session_with_answer(
        client,
        project_id,
        question="What is a tensor?",
        body="A tensor is a multidimensional array.",
        grounded=False,
    )

    response = _draft(client, project_id, session_id, message_id)
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "not_grounded"
    assert client.get(f"/api/projects/{project_id}/knowledge").json()["total"] == 0


def test_only_an_answer_can_become_a_note(client):
    project_id = _project(client)
    session_id, _ = _session_with_answer(client, project_id)

    from app.agent.models import AgentMessage
    from app.db import SessionLocal

    with SessionLocal() as session:
        asked = (
            session.query(AgentMessage)
            .filter_by(session_id=session_id, role="user")
            .one()
        )
        asked_id = asked.id

    response = _draft(client, project_id, session_id, asked_id)
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "not_an_answer"


def test_a_message_from_another_conversation_is_not_draftable(client):
    project_id = _project(client)
    first_session, _ = _session_with_answer(client, project_id, question="First question?")
    _, second_message = _session_with_answer(client, project_id, question="Second question?")

    response = _draft(client, project_id, first_session, second_message)
    assert response.status_code == 404
    assert response.json()["detail"]["error"] == "message_not_found"


def test_the_same_title_is_not_stored_twice(client):
    project_id = _project(client)
    first_session, first_message = _session_with_answer(client, project_id)
    created = _draft(client, project_id, first_session, first_message).json()["entry"]

    second_session, second_message = _session_with_answer(client, project_id)
    response = _draft(client, project_id, second_session, second_message)
    assert response.status_code == 201
    body = response.json()

    assert body["entry"] is None
    assert body["duplicate_of"] == created["id"]
    assert [item["id"] for item in body["candidates"]] == [created["id"]]
    assert body["candidates"][0]["score"] == 1.0
    assert client.get(f"/api/projects/{project_id}/knowledge").json()["total"] == 1


def test_a_confirmed_entry_is_reported_as_a_candidate_and_left_alone(client):
    project_id = _project(client)
    confirmed = _create(
        client,
        project_id,
        title="Why does broadcasting align trailing dimensions?",
        body="A settled definition somebody wrote by hand.",
        kind="definition",
    ).json()
    client.post(f"/api/knowledge/{confirmed['id']}/confirm")

    session_id, message_id = _session_with_answer(client, project_id)
    body = _draft(client, project_id, session_id, message_id).json()

    # Same title, so nothing new is written and the confirmed body is untouched.
    assert body["entry"] is None
    assert body["duplicate_of"] == confirmed["id"]
    after = client.get(f"/api/knowledge/{confirmed['id']}").json()
    assert after["status"] == "confirmed"
    assert after["body"] == "A settled definition somebody wrote by hand."


def test_a_near_duplicate_is_reported_without_blocking_the_new_draft(client):
    project_id = _project(client)
    _create(
        client,
        project_id,
        title="Why broadcasting aligns trailing dimensions",
        body="An older note about the same idea.",
    )

    session_id, message_id = _session_with_answer(client, project_id)
    body = _draft(client, project_id, session_id, message_id).json()

    assert body["entry"] is not None
    assert body["duplicate_of"] is None
    scores = [item["score"] for item in body["candidates"]]
    assert scores and scores[0] < 1.0
    assert len(body["candidates"]) == 1


def test_the_title_falls_back_to_the_answer_when_nothing_was_asked(client):
    project_id = _project(client)

    from app.agent.models import AgentMessage, AgentSession
    from app.db import SessionLocal

    with SessionLocal() as session:
        conversation = AgentSession(project_id=project_id, mode="explore")
        session.add(conversation)
        session.flush()
        answer = AgentMessage(
            session_id=conversation.id,
            role="assistant",
            body="Broadcasting stretches size-1 dimensions.\n\nA second paragraph.",
            grounded=1,
            source_refs=[{"marker": "S1", "chunk_id": 1, "resource_id": 1, "filename": "a.md"}],
        )
        session.add(answer)
        session.commit()
        session_id, message_id = conversation.id, answer.id

    entry = _draft(client, project_id, session_id, message_id).json()["entry"]
    assert entry["title"] == "Broadcasting stretches size-1 dimensions."
    assert "A second paragraph." in entry["body"]


def test_an_archived_project_cannot_promote_an_answer(client):
    project_id = _project(client)
    session_id, message_id = _session_with_answer(client, project_id)
    assert client.post(f"/api/projects/{project_id}/archive").status_code in (200, 204)

    response = _draft(client, project_id, session_id, message_id)
    assert response.status_code == 409
    assert response.json()["detail"]["error"] == "project_archived"
