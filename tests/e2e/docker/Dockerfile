ARG JELLYFIN_IMAGE
FROM ${JELLYFIN_IMAGE}

# Copy provisioned config and cache into the image
COPY --chown=jellyfin:jellyfin provisioned-config /config
COPY --chown=jellyfin:jellyfin provisioned-cache /cache
