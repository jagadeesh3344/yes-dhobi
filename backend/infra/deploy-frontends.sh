#!/usr/bin/env bash
# Builds and publishes the admin panel and the vendor website to S3 + CloudFront.
#
#   AWS_PROFILE=yesdhobi bash infra/deploy-frontends.sh
#
# Expects the repos checked out side by side:
#   <root>/yes-dhobi            (this repo: website at root, backend/ inside)
#   <root>/Yes-dhobi-admin-panel
# Override with ADMIN_DIR / WEB_DIR. The API URL is read from the backend stack.
set -euo pipefail
export PATH="/c/Program Files/Amazon/AWSCLIV2:$PATH"
cd "$(dirname "$0")"

export AWS_PROFILE="${AWS_PROFILE:-yesdhobi}"
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-southeast-2}"
STACK="${FRONTEND_STACK_NAME:-yesdhobi-frontends}"
BACKEND_STACK="${STACK_NAME:-yesdhobi-backend}"
PARAMS="${PARAMS:-}"   # e.g. "AdminDomainName=admin.yesdhobi.com WebDomainName=yesdhobi.com CertificateArn=arn:aws:acm:us-east-1:..."
WEB_DIR="${WEB_DIR:-$(cd ../.. && pwd)}"
ADMIN_DIR="${ADMIN_DIR:-$WEB_DIR/../Yes-dhobi-admin-panel}"
[ -d "$ADMIN_DIR" ] || ADMIN_DIR="$WEB_DIR/../admin-panel"

echo "==> Deploying $STACK"
aws cloudformation deploy --template-file frontends.yaml --stack-name "$STACK" --parameter-overrides $PARAMS --no-fail-on-empty-changeset

out() { aws cloudformation describe-stacks --stack-name "$1" --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text; }
API_URL=$(out "$BACKEND_STACK" ApiUrl)
export VITE_API_URL="$API_URL/api/v1"
echo "==> API: $VITE_API_URL"

publish() { # name dir bucket distribution
  echo "==> Building $1 ($2)"
  (cd "$2" && npm ci --silent && npm run build)
  aws s3 sync "$2/dist" "s3://$3" --delete --cache-control "public,max-age=31536000,immutable" --exclude index.html
  aws s3 cp "$2/dist/index.html" "s3://$3/index.html" --cache-control "no-cache"
  aws cloudfront create-invalidation --distribution-id "$4" --paths "/*" >/dev/null
}

publish "admin panel" "$ADMIN_DIR" "$(out "$STACK" AdminBucket)" "$(out "$STACK" AdminDistributionId)"
publish "website" "$WEB_DIR" "$(out "$STACK" WebBucket)" "$(out "$STACK" WebDistributionId)"

echo "==> Admin panel: $(out "$STACK" AdminUrl)"
echo "==> Website    : $(out "$STACK" WebUrl)"
echo "Remember to set CorsOrigins on the backend stack to these origins (PARAMS=\"CorsOrigins=...\" bash infra/deploy-backend.sh)."
