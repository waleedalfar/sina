"""
Simple substring/marker matching — not semantic/NLI-based detection. See
evaluation.md: this is a limited MVP harness by deliberate choice, not an
oversight. `marker_match`, `canary_check`, and `exact_fuzzy_match` are
scoring-identical (presence/absence of `scoring_criteria` in the output);
they differ in how the calling case's *message* is constructed
(runner.py), not in how it's scored. `human_review` cases aren't scored
here at all — see the PATCH endpoint in router.py.
"""

from app.evaluation.models import EvaluationCase


def score_case(case: EvaluationCase, output: str) -> bool:
    marker_present = case.scoring_criteria.lower() in output.lower()
    return marker_present == case.expect_marker_present
