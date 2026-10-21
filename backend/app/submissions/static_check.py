"""Deterministic static analysis of uploaded code and logs.

Nothing here executes the learner's program. `ast.parse` builds a syntax tree and is
never followed by `compile`/`exec`; the log analysis only reads text the learner says
came from their own machine. That distinction is why every finding carries an
`evidence_type`: `confirmed_static` for what the source text itself proves,
`user_reported` for what a log claims happened, `inferred` for a link between the two,
and `needs_local_check` for anything only the learner's environment can settle.
"""

import ast
from dataclasses import asdict, dataclass
from typing import Literal

EvidenceType = Literal["confirmed_static", "user_reported", "inferred", "needs_local_check"]
Severity = Literal["error", "warning", "info"]

MAX_FINDINGS = 40
MAX_SCANNED_LINES = 20_000

# Calls that would matter if the server ever ran the file. It never does; the finding
# exists so the learner can see that we noticed, and so the review can say plainly that
# the code was not executed.
_PROCESS_CALLS = {
    "eval": "eval()",
    "exec": "exec()",
    "compile": "compile()",
    "system": "os.system()",
    "popen": "subprocess/os.popen()",
    "run": "subprocess.run()",
    "Popen": "subprocess.Popen()",
    "check_output": "subprocess.check_output()",
}

_LOG_PATTERNS: tuple[tuple[str, tuple[str, ...], Severity, str], ...] = (
    (
        "runtime_shape_mismatch",
        ("shape", "size mismatch", "broadcast", "mat1 and mat2", "must match"),
        "error",
        "shape/broadcast",
    ),
    ("runtime_device_mismatch", ("device",), "error", "device"),
    ("runtime_out_of_memory", ("out of memory",), "error", "GPU memory"),
    ("runtime_dtype_mismatch", ("dtype", "scalar type"), "warning", "dtype"),
)

_ERROR_MARKERS = ("RuntimeError:", "ValueError:", "TypeError:", "IndexError:", "AssertionError:")


@dataclass
class StaticFinding:
    file: str
    line_start: int
    line_end: int
    category: str
    severity: Severity
    evidence_type: EvidenceType
    description: str
    suggestion: str

    def to_dict(self) -> dict:
        return asdict(self)


def analyze_python_code(filename: str, source_code: str) -> list[StaticFinding]:
    """Parse the file and report hazards the source text alone can prove."""
    findings: list[StaticFinding] = []
    if source_code.count("\n") > MAX_SCANNED_LINES:
        return findings
    try:
        tree = ast.parse(source_code, filename=filename)
    except SyntaxError as exc:
        findings.append(
            StaticFinding(
                file=filename,
                line_start=exc.lineno or 1,
                line_end=exc.lineno or 1,
                category="syntax_error",
                severity="error",
                evidence_type="confirmed_static",
                description=f"Python syntax error: {exc.msg}",
                suggestion="Fix the syntax error so the script can compile and run locally.",
            )
        )
        return findings

    for node in ast.walk(tree):
        if isinstance(node, ast.Subscript):
            finding = _shape_reduction_finding(filename, node)
            if finding is not None:
                findings.append(finding)
        elif isinstance(node, ast.Call):
            finding = _process_call_finding(filename, node)
            if finding is not None:
                findings.append(finding)
        if len(findings) >= MAX_FINDINGS:
            break

    return findings


def _shape_reduction_finding(filename: str, node: ast.Subscript) -> StaticFinding | None:
    """Flag `tensor[:, 0]`, which drops an axis where `tensor[:, 0:1]` would keep it."""
    if not isinstance(node.slice, ast.Tuple) or len(node.slice.elts) != 2:
        return None
    first, second = node.slice.elts
    if not isinstance(first, ast.Slice):
        return None
    if not (isinstance(second, ast.Constant) and type(second.value) is int):
        return None
    index = second.value
    return StaticFinding(
        file=filename,
        line_start=node.lineno,
        line_end=getattr(node, "end_lineno", node.lineno) or node.lineno,
        category="tensor_shape_reduction",
        severity="warning",
        evidence_type="confirmed_static",
        description=(
            f"The source uses the scalar integer index {index} on the second axis. "
            "If this object is a 2-D PyTorch tensor, the selected result is a vector, "
            "not a column matrix. The object's runtime type and intended shape are not proven here."
        ),
        suggestion=(
            f"If a column matrix is intended, use [:, {index}:{index + 1}] "
            "or apply .unsqueeze(1) to the selected vector. Keep scalar indexing when a vector is intended."
        ),
    )


def _process_call_finding(filename: str, node: ast.Call) -> StaticFinding | None:
    func = node.func
    name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
    label = _PROCESS_CALLS.get(name or "")
    if label is None:
        return None
    return StaticFinding(
        file=filename,
        line_start=node.lineno,
        line_end=getattr(node, "end_lineno", node.lineno) or node.lineno,
        category="process_execution",
        severity="info",
        evidence_type="confirmed_static",
        description=(
            f"The source calls {ast.unparse(func)}(...). A matching method name does not "
            "prove process execution; its runtime implementation is unknown. "
            "Uploaded code was not executed here."
        ),
        suggestion=(
            "Run the script yourself and upload the output if that call is part of the "
            "exercise. If it is not, consider removing it."
        ),
    )


def parse_log_evidence(filename: str, log_text: str) -> list[StaticFinding]:
    """Read runtime symptoms out of a log the learner supplied. Never claims we ran it."""
    findings: list[StaticFinding] = []
    lines = log_text.splitlines()[:MAX_SCANNED_LINES]
    for index, line in enumerate(lines, start=1):
        lowered = line.lower()
        if not any(marker.lower() in lowered for marker in _ERROR_MARKERS):
            continue
        for category, needles, severity, label in _LOG_PATTERNS:
            if any(needle in lowered for needle in needles):
                findings.append(
                    StaticFinding(
                        file=filename,
                        line_start=index,
                        line_end=index,
                        category=category,
                        severity=severity,
                        evidence_type="user_reported",
                        description=(
                            f"Your log reports a {label} failure: {line.strip()[:500]}"
                        ),
                        suggestion=(
                            "Print the tensor shapes on both sides of the failing operation "
                            "in your own environment, then compare them with the shapes the "
                            "code intends."
                        ),
                    )
                )
                break
        else:
            findings.append(
                StaticFinding(
                    file=filename,
                    line_start=index,
                    line_end=index,
                    category="runtime_error",
                    severity="error",
                    evidence_type="user_reported",
                    description=f"Your log reports: {line.strip()[:500]}",
                    suggestion=(
                        "Open the traceback in your local terminal and check the innermost "
                        "frame; upload that section if you want it analysed."
                    ),
                )
            )
        if len(findings) >= MAX_FINDINGS:
            break
    return findings


def correlate(
    code_findings: list[StaticFinding], log_findings: list[StaticFinding]
) -> list[StaticFinding]:
    """Link a static hazard to a reported symptom, labelled as inference, not proof."""
    hazards = [f for f in code_findings if f.category == "tensor_shape_reduction"]
    symptoms = [f for f in log_findings if f.category == "runtime_shape_mismatch"]
    if not hazards or not symptoms:
        return []
    hazard = hazards[0]
    symptom = symptoms[0]
    return [
        StaticFinding(
            file=hazard.file,
            line_start=hazard.line_start,
            line_end=hazard.line_end,
            category="likely_root_cause",
            severity="warning",
            evidence_type="inferred",
            description=(
                f"The reported shape error ({symptom.file} line {symptom.line_start}) is "
                f"consistent with the dropped axis at {hazard.file} line "
                f"{hazard.line_start}. This is a correlation between the source text and "
                "your log, not a verified run."
            ),
            suggestion=(
                "Check the intended output shape first. Matrix-vector matmul can be valid. "
                "Keep the axis only if a column is required; this alone cannot fix "
                "incompatible inner dimensions. Re-run locally and upload the output."
            ),
        )
    ]


def needs_local_check(code_findings: list[StaticFinding]) -> list[StaticFinding]:
    """Name what only the learner's machine can settle, instead of guessing.

    Always returns one finding when no log was uploaded: "nothing was proven" and
    "nothing was checked" are different claims, and only the second is true here.
    """
    first = code_findings[0] if code_findings else None
    return [
        StaticFinding(
            file=first.file if first else "solution.py",
            line_start=first.line_start if first else 1,
            line_end=first.line_end if first else 1,
            category="verify_locally",
            severity="info",
            evidence_type="needs_local_check",
            description=(
                "Static analysis cannot confirm the runtime shapes, dtypes or device "
                "placement of these tensors. A log without recognized errors is not "
                "proof that the code is correct."
            ),
            suggestion=(
                "Run the script locally with print(t.shape, t.dtype, t.device) before the "
                "failing operation and upload the output."
            ),
        )
    ]
