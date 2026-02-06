FROM mcr.microsoft.com/playwright:v1.57.0-noble

WORKDIR /rpx-xui-e2e-tests/

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/patches ./.yarn/patches

RUN corepack enable
RUN yarn install --immutable
RUN yarn playwright install --with-deps

COPY . .

ENTRYPOINT ["/bin/bash", "-l", "-c"]
