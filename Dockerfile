FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /rpx-xui-e2e-tests/

COPY package.json ./
COPY .yarnrc.yml ./

RUN corepack enable
RUN yarn install
RUN yarn playwright install --with-deps

COPY . .

ENTRYPOINT ["/bin/bash", "-l", "-c"]
