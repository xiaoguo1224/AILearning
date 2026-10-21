"""AI-extracted learning-order relationships between a project's courses/chapters."""

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ProjectGraphEdge(Base):
    """One directed relationship between two nodes in a project's learning graph.

    Nodes are courses or lessons (chapters). Edges are extracted by the LLM
    from titles and content summaries, not hand-specified.
    """

    __tablename__ = "project_graph_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    from_type: Mapped[str] = mapped_column(String(16), nullable=False)  # course | lesson
    from_id: Mapped[int] = mapped_column(Integer, nullable=False)
    to_type: Mapped[str] = mapped_column(String(16), nullable=False)
    to_id: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)  # prerequisite | related | sequence
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
