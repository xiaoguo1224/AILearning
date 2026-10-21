import io
import zipfile


def test_resource_upload_and_search_flow(client):
    # 1. Create two projects
    p1 = client.post("/api/projects", json={"name": "Project Alpha"}).json()
    p2 = client.post("/api/projects", json={"name": "Project Beta"}).json()
    p1_id = p1["id"]
    p2_id = p2["id"]

    # 2. Upload a text / markdown resource to p1
    res1 = client.post(
        f"/api/projects/{p1_id}/resources/text",
        json={
            "title": "Attention Mechanism Notes",
            "content": "Scaled dot product attention is computed as softmax(QK^T / sqrt(d_k))V. Multi-head attention allows joint information.",
            "kind": "markdown"
        }
    )
    assert res1.status_code == 201
    r1_data = res1.json()
    assert r1_data["parse_status"] == "completed"
    assert len(r1_data["chunks"]) >= 1
    assert "softmax" in r1_data["chunks"][0]["text"]

    # 3. Upload a mock DOCX file
    docx_buf = io.BytesIO()
    with zipfile.ZipFile(docx_buf, "w") as zf:
        zf.writestr(
            "word/document.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                <w:body>
                    <w:p><w:r><w:t>Residual connections prevent vanishing gradients in deep ResNets.</w:t></w:r></w:p>
                    <w:p><w:r><w:t>Layer normalization stabilizes hidden state dynamics across batches.</w:t></w:r></w:p>
                </w:body>
            </w:document>"""
        )
    docx_bytes = docx_buf.getvalue()

    res_docx = client.post(
        f"/api/projects/{p1_id}/resources/upload",
        files={"file": ("resnet.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    )
    assert res_docx.status_code == 201
    rd_data = res_docx.json()
    assert rd_data["parse_status"] == "completed"
    assert len(rd_data["chunks"]) >= 1

    # 4. Search in Project 1 via SQLite FTS5
    search_res = client.get(f"/api/projects/{p1_id}/resources/search?q=softmax")
    assert search_res.status_code == 200
    items = search_res.json()
    assert len(items) >= 1
    assert items[0]["filename"] == "Attention Mechanism Notes"
    assert "softmax" in items[0]["snippet"].lower()

    # Search in Project 2 (should be empty because not linked)
    search_p2 = client.get(f"/api/projects/{p2_id}/resources/search?q=softmax")
    assert search_p2.status_code == 200
    assert len(search_p2.json()) == 0

    # 5. Share resource across projects by uploading identical file or link
    # Uploading identical docx to p2 should reuse same sha256 and link to p2
    res_docx_p2 = client.post(
        f"/api/projects/{p2_id}/resources/upload",
        files={"file": ("resnet_shared.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    )
    assert res_docx_p2.status_code == 201
    assert res_docx_p2.json()["id"] == rd_data["id"]

    # 6. Delete from p1: since p2 still references it, resource file & record should NOT be destroyed
    del_p1 = client.delete(f"/api/projects/{p1_id}/resources/{rd_data['id']}")
    assert del_p1.status_code == 200
    assert del_p1.json()["deleted_permanently"] is False

    # Check p2 still has it
    res_get = client.get(f"/api/resources/{rd_data['id']}")
    assert res_get.status_code == 200

    # Delete from p2: now count drops to 0, deleted permanently
    del_p2 = client.delete(f"/api/projects/{p2_id}/resources/{rd_data['id']}")
    assert del_p2.status_code == 200
    assert del_p2.json()["deleted_permanently"] is True

    # Now get 404
    assert client.get(f"/api/resources/{rd_data['id']}").status_code == 404


def test_search_answers_long_chinese_question_with_bigram_fallback(client):
    """A long unbroken Chinese question has no whitespace, so the verbatim FTS
    phrase can never match under unicode61 tokenisation. The bigram fallback
    must still find the chunk; keyword queries keep working as before."""
    p = client.post("/api/projects", json={"name": "PyTorch CN"}).json()
    pid = p["id"]
    res = client.post(
        f"/api/projects/{pid}/resources/text",
        json={
            "title": "矩阵乘法笔记",
            "content": "矩阵乘法使用 @ 运算符或 torch.matmul，而不是星号 *。星号是逐元素乘法。",
            "kind": "markdown",
        },
    )
    assert res.status_code == 201

    long_q = client.get(f"/api/projects/{pid}/resources/search", params={"q": "为什么矩阵乘法里面用星号会报错"})
    assert long_q.status_code == 200
    items = long_q.json()
    assert len(items) >= 1
    assert items[0]["filename"] == "矩阵乘法笔记"

    keyword = client.get(f"/api/projects/{pid}/resources/search", params={"q": "矩阵乘法 星号"})
    assert keyword.status_code == 200
    assert len(keyword.json()) >= 1
