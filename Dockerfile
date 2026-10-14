FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Build-time configuration: the API provider, optional Claude assistant and single sign-on.
ARG VITE_DATA_PROVIDER=http
ARG VITE_ASSISTANT=
ARG VITE_OIDC_AUTHORITY=
ARG VITE_OIDC_CLIENT_ID=
ARG VITE_ADMIN_EMAILS=
ARG VITE_AUTH=
ARG VITE_OS_API_KEY=
ENV VITE_DATA_PROVIDER=$VITE_DATA_PROVIDER VITE_ASSISTANT=$VITE_ASSISTANT VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID VITE_ADMIN_EMAILS=$VITE_ADMIN_EMAILS VITE_AUTH=$VITE_AUTH VITE_OS_API_KEY=$VITE_OS_API_KEY
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
