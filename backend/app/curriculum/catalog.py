from app.concepts import normalize_concept

# Explicit teaching suggestions, not dependencies inferred from chapter positions.
# Aliases locate reading material only; they never merge persisted learning histories.
TOPICS = [
    {
        "id": "tensors",
        "title": "Tensors",
        "aliases": ["tensor", "tensors", "张量", "数据操作"],
        "prerequisites": [],
        "chapter": "2.1 数据操作",
        "path": "chapter_preliminaries/ndarray.html",
    },
    {
        "id": "broadcasting",
        "title": "Broadcasting",
        "aliases": ["broadcasting", "tensor broadcasting", "广播", "广播机制"],
        "prerequisites": ["tensors"],
        "chapter": "2.1 数据操作 · 广播机制",
        "path": "chapter_preliminaries/ndarray.html",
    },
    {
        "id": "matmul",
        "title": "Matrix multiplication",
        "aliases": ["matrix multiplication", "matmul", "矩阵乘法"],
        "prerequisites": ["tensors"],
        "chapter": "2.3 线性代数",
        "path": "chapter_preliminaries/linear-algebra.html",
    },
    {
        "id": "autograd",
        "title": "Automatic differentiation",
        "aliases": ["autograd", "automatic differentiation", "自动微分"],
        "prerequisites": ["tensors"],
        "chapter": "2.5 自动微分",
        "path": "chapter_preliminaries/autograd.html",
    },
    {
        "id": "attention",
        "title": "Attention",
        "aliases": ["attention", "注意力", "注意力机制"],
        "prerequisites": ["matmul"],
        "chapter": "10.3 注意力评分函数",
        "path": "chapter_attention-mechanisms/attention-scoring-functions.html",
    },
    {
        "id": "transformer",
        "title": "Transformer",
        "aliases": ["transformer"],
        "prerequisites": ["attention", "autograd"],
        "chapter": "10.7 Transformer",
        "path": "chapter_attention-mechanisms/transformer.html",
    },
    {
        "id": "visual_tokens",
        "title": "Visual tokens",
        "aliases": ["visual tokens", "视觉token", "视觉 token"],
        "prerequisites": ["transformer"],
    },
    {
        "id": "multimodal",
        "title": "Multimodal alignment",
        "aliases": ["multimodal alignment", "多模态对齐"],
        "prerequisites": ["visual_tokens"],
    },
    {
        "id": "radar",
        "title": "Radar representations",
        "aliases": ["radar representations", "雷达表征"],
        "prerequisites": ["tensors", "matmul"],
    },
    {
        "id": "vlm",
        "title": "Vision-language models",
        "aliases": ["vision-language models", "vlm", "视觉语言模型"],
        "prerequisites": ["multimodal"],
    },
]
BY_ID = {topic["id"]: topic for topic in TOPICS}
BY_ALIAS = {normalize_concept(alias): topic for topic in TOPICS for alias in topic["aliases"]}


def reading(topic: dict | None) -> dict | None:
    if topic is None or "path" not in topic:
        return None
    return {"title": topic["chapter"], "url": f"https://zh.d2l.ai/{topic['path']}"}
