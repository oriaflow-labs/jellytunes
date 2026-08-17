ARG JELLYFIN_IMAGE=jellyfin/jellyfin:10.10.3
FROM ${JELLYFIN_IMAGE}

# Copy provisioned config and cache into the image
COPY --chown=jellyfin:jellyfin provisioned-config /config
COPY --chown=jellyfin:jellyfin provisioned-cache /cache
