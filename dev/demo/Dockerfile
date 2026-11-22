# Home Assistant with libfaketime, for the demo HA: its clock runs at the demo's time
# (scripts/demo.sh sets FAKETIME).
ARG HA_VERSION=stable
FROM ghcr.io/home-assistant/home-assistant:${HA_VERSION}
RUN apk add --no-cache libfaketime
