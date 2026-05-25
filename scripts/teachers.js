// scripts/teachers.js — 21,000 teachers Login → Model → Logout
// Mirrors PLAT-4287-A2-Login-Teachers.jmx (Phase 3, three enabled samplers).
import { SharedArray } from 'k6/data';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
import { teacherFlow } from '/lib/flow.js';

const TARGET_VUS       = parseInt(__ENV.TARGET_VUS       || '21000', 10);
const RAMP_SECONDS     = parseInt(__ENV.RAMP_SECONDS     || '240',   10);
const HOLD_SECONDS     = parseInt(__ENV.HOLD_SECONDS     || '600',   10);
const RAMPDOWN_SECONDS = parseInt(__ENV.RAMPDOWN_SECONDS || '60',    10);
const CSV_PATH         = __ENV.TEACHERS_CSV || '/data/teachers.csv';

const credentials = new SharedArray('teachers', function () {
  const raw = open(CSV_PATH);
  return papaparse.parse(raw, { header: true, skipEmptyLines: true }).data;
});

export const options = {
  discardResponseBodies: false,
  scenarios: {
    teachers_login: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: `${RAMP_SECONDS}s`,     target: TARGET_VUS },
        { duration: `${HOLD_SECONDS}s`,     target: TARGET_VUS },
        { duration: `${RAMPDOWN_SECONDS}s`, target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_failed{endpoint:login}':    ['rate<0.02'],
    'http_req_failed{endpoint:model}':    ['rate<0.02'],
    'http_req_failed{endpoint:logout}':   ['rate<0.02'],
    'http_req_duration{endpoint:login}':  ['p(95)<3000', 'p(99)<6000'],
    'http_req_duration{endpoint:model}':  ['p(95)<3000', 'p(99)<6000'],
    'http_req_duration{endpoint:logout}': ['p(95)<1500', 'p(99)<3000'],
  },
  noConnectionReuse: false,
  userAgent: 'k6-plat4287-teachers/1.0',
};

export default function () {
  const idx = (__VU - 1 + __ITER) % credentials.length;
  const row = credentials[idx];
  teacherFlow({ username: row.username, password: row.password });
}
