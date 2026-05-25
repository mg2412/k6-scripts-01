// lib/flow.js — Login → Model → Logout workflows ported from the
// PLAT-4287 JMeter plans:
//   - studentapp/PLAT-4287-A2-Login-Students.jmx
//   - teacherapp/PLAT-4287-A2-Login-Teachers.jmx
//
// CSV format expected (both roles): "username,password" with a header row.

import http from 'k6/http';
import { check } from 'k6';
import encoding from 'k6/encoding';

const BASE_URL = __ENV.A2_HOST_URL || 'https://services.elclouduat.net';

const STUDENT = {
  loginPath:  '/reflex/auth/login/app',
  modelPath:  '/reflex/api/student/model',
  logoutPath: '/reflex/api/logout',
};

const TEACHER = {
  loginPath:  '/platform/auth/login/admin',
  modelPath:  '/platform/api/platform/v2/model',
  logoutPath: '/platform/api/logout',
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// Decode the `jti` claim out of a JWT's payload segment (mirrors the
// Groovy JSR223 PostProcessor in the JMX).
function decodeJti(jwt) {
  if (!jwt) return '';
  const parts = jwt.split('.');
  if (parts.length !== 3) return '';
  try {
    // base64url -> base64 with padding
    let p = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (p.length % 4) p += '=';
    const json = encoding.b64decode(p, 'std', 's');
    const claims = JSON.parse(json);
    return claims && claims.jti ? String(claims.jti) : '';
  } catch (_e) {
    return '';
  }
}

function authHeaders(accessToken, jti) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'jwt': accessToken,
    'X-CSRFToken': jti,
    'Accept': 'application/json',
  };
}

function buildModelUrl(modelPath) {
  // The students JMX appends a `localdatetime` query param. We replicate
  // the shape so the server sees the same request signature.
  const now = new Date().toString();
  const sep = modelPath.includes('?') ? '&' : '?';
  return `${BASE_URL}${modelPath}${sep}localdatetime=${encodeURIComponent(now)}`;
}

function runFlow(role, paths, creds) {
  const loginRes = http.post(
    `${BASE_URL}${paths.loginPath}`,
    JSON.stringify({ username: creds.username, password: creds.password }),
    { headers: JSON_HEADERS, tags: { endpoint: 'login', role } },
  );

  const okLogin = check(loginRes, {
    'login HTTP 200':         (r) => r.status === 200,
    'login has accessToken':  (r) => {
      try { return !!(r.json() && r.json().accessToken); } catch (_e) { return false; }
    },
  });
  if (!okLogin) return;

  let accessToken = '';
  try { accessToken = loginRes.json().accessToken || ''; } catch (_e) { return; }
  if (!accessToken) return;

  const jti = decodeJti(accessToken);
  const auth = authHeaders(accessToken, jti);

  const modelRes = http.get(buildModelUrl(paths.modelPath), {
    headers: auth,
    tags: { endpoint: 'model', role },
  });
  check(modelRes, { 'model HTTP 200': (r) => r.status === 200 });

  const logoutRes = http.get(`${BASE_URL}${paths.logoutPath}`, {
    headers: auth,
    tags: { endpoint: 'logout', role },
  });
  check(logoutRes, { 'logout HTTP 200': (r) => r.status === 200 });
}

export function studentFlow(creds) { runFlow('student', STUDENT, creds); }
export function teacherFlow(creds) { runFlow('teacher', TEACHER, creds); }
