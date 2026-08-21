"""
§15 risk-questionnaire scoring — advisory only, never authoritative. Per
governance.md: "the computation rule itself should be simple enough to
state in one sentence to a reviewer... if it can't be explained that
plainly, it's over-claiming certainty §15 explicitly warns against."

One sentence: any diagnosis/treatment/medication/autonomous-action answer
suggests HIGH; any other clinically-relevant answer suggests MODERATE;
otherwise LOW. `allows_independent_clinician_review` is deliberately
excluded from both lists — it's a mitigating factor (a human can catch a
bad output), not a risk-increasing one, so including it in an escalation
list would invert its meaning.
"""

from app.governance.models import RiskClassification

_HIGH_SIGNAL_FIELDS = (
    "recommends_diagnosis",
    "recommends_treatment",
    "influences_medication_decisions",
    "takes_autonomous_clinical_action",
)

_MODERATE_SIGNAL_FIELDS = (
    "processes_phi",
    "analyzes_medical_images",
    "analyzes_physiological_signals",
    "generates_patient_specific_recommendations",
    "produces_time_critical_recommendations",
    "directly_affects_patient_care",
)


def compute_suggested_classification(responses: dict[str, bool]) -> str:
    if any(responses[f] for f in _HIGH_SIGNAL_FIELDS):
        return RiskClassification.high.value
    if any(responses[f] for f in _MODERATE_SIGNAL_FIELDS):
        return RiskClassification.moderate.value
    return RiskClassification.low.value
