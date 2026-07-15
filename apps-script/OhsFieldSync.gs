// OHS Field Sync — reads the field snapshot from Google Drive and returns
// stripped data to an authenticated officer.
//
// Setup:
//  1. In Google Drive, upload your ohs-field-snapshot.json to a folder you own.
//  2. Right-click the file → Share → "Anyone with the link" is NOT needed
//     since this script runs as YOU and has access to your Drive.
//  3. Get the file ID from the URL (the long string between /d/ and /view).
//  4. Paste it below as DRIVE_FILE_ID.
//  5. Deploy → New deployment → type: Web app
//       Execute as: Me
//       Who has access: Anyone (this is safe — auth is inside the script)
//  6. Copy the deployment URL, paste into the admin app: Settings → Data file → Apps Script URL.

const DRIVE_FILE_ID = 'PASTE_YOUR_FIELD_SNAPSHOT_FILE_ID_HERE';

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action !== 'login') return jsonResponse({ok:false, error:'unknown_action'});

    const raw = DriveApp.getFileById(DRIVE_FILE_ID).getBlob().getDataAsString();
    const data = JSON.parse(raw);

    const user = (data.users || []).find(u =>
      u.username === req.username &&
      u.password === req.password &&
      u.active === true &&
      u.role === 'officer' &&
      u.can_do_site_check === true
    );

    if (!user) return jsonResponse({ok:false, error:'invalid_credentials'});

    // Build the officer-facing snapshot (strip anything they shouldn't see)
    const snapshot = {
      meta: {
        version: data.meta.version,
        warning_thresholds: data.meta.warning_thresholds,
        field_sync_max_stale_days: (data.meta.field_sync && data.meta.field_sync.max_stale_days) || 30,
        published_at: (data.meta.field_sync && data.meta.field_sync.last_published_at) || data.meta.exported_at || new Date().toISOString()
      },
      employees: (data.employees || [])
        .filter(emp => !emp.personal.archived)
        .map(emp => ({
          employee_id: emp.employee_id,
          national_id: emp.national_id,
          name: emp.name,
          team: emp.team,
          personal: {
            title: emp.personal.title,
            subcontractor: emp.personal.subcontractor,
            employment_status: emp.personal.employment_status,
            legal_permission: emp.personal.legal_permission,
            archived: false
          },
          certificates: stripCertLinks(emp.certificates),
          qualifications: emp.qualifications,
          drug_tests: emp.drug_tests
        }))
    };

    return jsonResponse({
      ok: true,
      user: { username: user.username, display_name: user.display_name },
      snapshot: snapshot
    });
  } catch (err) {
    return jsonResponse({ok:false, error:'server_error', detail: String(err)});
  }
}

// Officers never see file_link, so strip it.
function stripCertLinks(certs) {
  const out = {};
  for (const k in certs) {
    out[k] = { expiry_date: (certs[k] && certs[k].expiry_date) || '' };
  }
  return out;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Optional: doGet for quick health check
function doGet(e) {
  return jsonResponse({ok:true, service:'OHS Field Sync', version:'1.0'});
}
