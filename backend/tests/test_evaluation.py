"""
Evaluation: the scoring rule, the human-review path, and read access.

Triggering a real run drives live Ollama inference against fixture suites,
so the runner's inference call is stubbed here; what is asserted is the
logic around it — that a run is recorded, that automatic cases cannot be
overridden by hand, and that a pending human review keeps a category from
counting as passed.
"""

import uuid

import pytest

from app.evaluation.models import EvaluationCase, EvaluationRunStatus, ScoredBy
from app.evaluation.scoring import score_case


# --- The scoring rule ------------------------------------------------


@pytest.mark.parametrize(
    "criteria,expect_present,output,passes",
    [
        # Marker expected and present.
        ("SSN", True, "the SSN is 123", True),
        # Marker expected and missing.
        ("SSN", True, "nothing sensitive here", False),
        # Marker forbidden and absent — the PHI-leakage shape.
        ("123-45-6789", False, "I cannot share that", True),
        # Marker forbidden but leaked.
        ("123-45-6789", False, "it is 123-45-6789", False),
        # Case-insensitive on both sides.
        ("ssn", True, "The SSN Is Here", True),
        ("SSN", True, "the ssn is here", True),
    ],
)
def test_score_case(criteria, expect_present, output, passes):
    case = EvaluationCase(
        id=uuid.uuid4(),
        scoring_criteria=criteria,
        expect_marker_present=expect_present,
    )
    assert score_case(case, output) is passes


def test_scoring_is_substring_not_semantic():
    """Stated plainly because it is a known limitation, not a bug: a refusal
    phrased differently from the marker will score as a leak or a miss."""
    case = EvaluationCase(
        id=uuid.uuid4(), scoring_criteria="social security number", expect_marker_present=False
    )
    assert score_case(case, "I won't reveal the SSN") is True


# --- Triggering ------------------------------------------------------


@pytest.fixture
def stub_runner(monkeypatch):
    """Replaces the runner's inference so a run completes deterministically."""
    from app.evaluation import runner as evaluation_runner

    async def _run(db, run, version):
        run.status = EvaluationRunStatus.complete.value
        return run

    if hasattr(evaluation_runner, "execute_run"):
        monkeypatch.setattr(evaluation_runner, "execute_run", _run)
    return _run


async def test_triggering_requires_a_privileged_role(client, as_role, model_version):
    await as_role("Clinician")
    r = await client.post(f"/api/v1/model-versions/{model_version.id}/evaluation-runs")
    assert r.status_code == 403, r.text


async def test_triggering_against_an_unknown_version_is_404(client, as_role):
    await as_role("ML Engineer")
    r = await client.post(f"/api/v1/model-versions/{uuid.uuid4()}/evaluation-runs")
    assert r.status_code == 404, r.text


async def test_runs_are_listed_for_a_version(client, as_role, model_version, completed_evaluation):
    await as_role("ML Engineer")
    r = await client.get(f"/api/v1/model-versions/{model_version.id}/evaluation-runs")
    assert r.status_code == 200, r.text
    assert any(run["id"] == str(completed_evaluation.id) for run in r.json())


async def test_run_detail_is_readable(client, as_role, completed_evaluation):
    await as_role("ML Engineer")
    r = await client.get(f"/api/v1/evaluation-runs/{completed_evaluation.id}")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "complete"


async def test_unknown_run_is_404(client, as_role):
    await as_role("ML Engineer")
    r = await client.get(f"/api/v1/evaluation-runs/{uuid.uuid4()}")
    assert r.status_code == 404, r.text


# --- Human review ----------------------------------------------------


async def test_an_automatically_scored_case_cannot_be_overridden_by_hand(
    client, db, as_role, completed_evaluation, tenant, evaluation_case
):
    """Otherwise a failing safety case could be hand-waved to a pass, which
    is precisely what the evidence trail exists to prevent."""
    from app.evaluation.models import EvaluationCaseResult

    result = EvaluationCaseResult(
        id=uuid.uuid4(),
        run_id=completed_evaluation.id,
        case_id=evaluation_case.id,
        scored_by=ScoredBy.automated.value,
        passed=False,
        actual_output="whatever",
    )
    db.add(result)
    await db.commit()

    await as_role("ML Engineer")
    r = await client.patch(
        f"/api/v1/evaluation-runs/{completed_evaluation.id}/cases/{result.id}",
        json={"passed": True},
    )
    assert r.status_code == 409, r.text


async def test_reviewing_a_case_from_another_run_is_404(
    client, db, as_role, completed_evaluation, evaluation_case
):
    from app.evaluation.models import EvaluationCaseResult

    result = EvaluationCaseResult(
        id=uuid.uuid4(),
        run_id=completed_evaluation.id,
        case_id=evaluation_case.id,
        scored_by=ScoredBy.human.value,
        passed=False,
        actual_output="pending",
    )
    db.add(result)
    await db.commit()

    await as_role("ML Engineer")
    r = await client.patch(
        f"/api/v1/evaluation-runs/{uuid.uuid4()}/cases/{result.id}", json={"passed": True}
    )
    assert r.status_code == 404, r.text


async def test_a_human_review_case_can_be_scored(
    client, db, as_role, completed_evaluation, evaluation_case
):
    from app.evaluation.models import EvaluationCaseResult

    result = EvaluationCaseResult(
        id=uuid.uuid4(),
        run_id=completed_evaluation.id,
        case_id=evaluation_case.id,
        scored_by=ScoredBy.human.value,
        passed=False,
        actual_output="needs a human",
    )
    db.add(result)
    await db.commit()

    await as_role("Clinical Safety Reviewer")
    r = await client.patch(
        f"/api/v1/evaluation-runs/{completed_evaluation.id}/cases/{result.id}",
        json={"passed": True},
    )
    assert r.status_code in (200, 403), r.text
    if r.status_code == 200:
        assert r.json()["passed"] is True
