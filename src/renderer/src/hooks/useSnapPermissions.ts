// src/renderer/src/hooks/useSnapPermissions.ts
// ORAIN-0578: loads the snap interface report once on mount.
//
// The report is a snapshot of the process's own confinement, which cannot
// change while the app runs (`snap connect` only takes effect on the next
// launch), so a single query per mount is enough — no polling, no refetch.

import { useEffect, useState } from 'react';
import {
  EMPTY_SNAP_PERMISSIONS_REPORT,
  type SnapPermissionsReport,
} from '../utils/snapPermissions';

export function useSnapPermissions(): SnapPermissionsReport {
  const [report, setReport] = useState<SnapPermissionsReport>(EMPTY_SNAP_PERMISSIONS_REPORT);

  useEffect(() => {
    let cancelled = false;
    window.api
      .checkSnapPermissions()
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch(() => {
        // Old main process without the handler, or IPC failure — stay on
        // the empty report so nothing is surfaced.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return report;
}
