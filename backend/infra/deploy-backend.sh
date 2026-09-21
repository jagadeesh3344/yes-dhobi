#!/usr/bin/env bash
# Deploys / updates the Yes Dhobi backend on AWS (ap-south-1 by default).
#
#   AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
#
# Idempotent: creates the stack on first run (RDS takes ~10 min), updates it after.
# Requires: aws cli v2 with a profile for the Yes Dhobi account. No Docker needed
# locally - the image is built by AWS CodeBuild straight from GitHub.
set -euo pipefail
cd "$(dirname "$0")"

export AWS_PROFILE="${AWS_PROFILE:-yesdhobi}"
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-south-1}"
STACK="${STACK_NAME:-yesdhobi-backend}"
PARAMS="${PARAMS:-}"   # extra --parameter-overrides, e.g. "CertificateArn=arn:... PublicBaseUrl=https://api.yesdhobi.com CorsOrigins=https://admin.yesdhobi.com"

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "==> Deploying $STACK to account $ACCOUNT in $AWS_DEFAULT_REGION"

exists=$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NONE")

if [ "$exists" = "NONE" ]; then
  echo "==> Phase 1/3: creating infrastructure (service scaled to 0 until the image exists)"
  aws cloudformation deploy --template-file backend.yaml --stack-name "$STACK" \
    --capabilities CAPABILITY_NAMED_IAM --parameter-overrides DesiredCount=0 $PARAMS
fi

PROJECT=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='CodeBuildProject'].OutputValue" --output text)
echo "==> Phase 2/3: building the API image from GitHub with CodeBuild ($PROJECT)"
BUILD_ID=$(aws codebuild start-build --project-name "$PROJECT" --query 'build.id' --output text)
while true; do
  STATUS=$(aws codebuild batch-get-builds --ids "$BUILD_ID" --query 'builds[0].buildStatus' --output text)
  case "$STATUS" in
    IN_PROGRESS) printf '.'; sleep 15 ;;
    SUCCEEDED) echo " build succeeded"; break ;;
    *) echo " build $STATUS - see CodeBuild logs in the console"; exit 1 ;;
  esac
done

echo "==> Phase 3/3: applying parameters and starting the service"
aws cloudformation deploy --template-file backend.yaml --stack-name "$STACK" \
  --capabilities CAPABILITY_NAMED_IAM --parameter-overrides DesiredCount=1 $PARAMS --no-fail-on-empty-changeset

CLUSTER=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='ClusterName'].OutputValue" --output text)
SERVICE=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='ServiceName'].OutputValue" --output text)
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --force-new-deployment >/dev/null
echo "==> waiting for the service to become stable (migrations + seed run on boot)"
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"

API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
echo "==> API is up: $API_URL/health"
curl -fsS "$API_URL/health" && echo
