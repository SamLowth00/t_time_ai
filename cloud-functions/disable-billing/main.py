"""Cloud Function: detach billing from a GCP project when its budget is exceeded.

Triggered by a Pub/Sub message published by a GCP Budget alert. On a message
indicating cost > budget, calls cloudbilling.projects.updateBillingInfo with an
empty billingAccountName, which detaches billing from the project. After that,
every paid Google API on the project returns 403 (including Places API) until
billing is re-enabled manually via the GCP Console.

This is the "hard cap" Google doesn't ship natively — they only ship alerts.

Deploy as a Cloud Function (Gen 2):
  - Runtime:    Python 3.12
  - Trigger:    Pub/Sub topic (e.g. "budget-alerts")
  - Entry point: stop_billing
  - Env var:    PROJECT_ID = the project to disable billing on
  - Service account: must have roles/billing.admin on the BILLING ACCOUNT
"""

import base64
import json
import os

import functions_framework
from googleapiclient import discovery

# Set as an env var on the Cloud Function — the project whose billing should be
# detached. Keep this explicit rather than inferring; you don't want a misrouted
# message disabling billing on the wrong project.
PROJECT_ID = os.environ["PROJECT_ID"]
PROJECT_NAME = f"projects/{PROJECT_ID}"


@functions_framework.cloud_event
def stop_billing(cloud_event):
    pubsub_message = cloud_event.data["message"]
    pubsub_data = json.loads(
        base64.b64decode(pubsub_message["data"]).decode("utf-8")
    )

    cost_amount = pubsub_data.get("costAmount", 0)
    budget_amount = pubsub_data.get("budgetAmount", 0)

    # Budget alerts fire at every threshold (50%, 90%, 100%). Only act on >100%.
    if cost_amount <= budget_amount:
        print(f"Under budget: cost={cost_amount} <= budget={budget_amount}. No action.")
        return

    print(
        f"OVER BUDGET (cost={cost_amount} > budget={budget_amount}). "
        f"Detaching billing from project {PROJECT_ID}."
    )

    billing = discovery.build("cloudbilling", "v1", cache_discovery=False)
    response = (
        billing.projects()
        .updateBillingInfo(
            name=PROJECT_NAME,
            body={"billingAccountName": ""},
        )
        .execute()
    )

    print(f"Billing disabled: {response}")
