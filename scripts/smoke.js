// scripts/smoke.js — 50-VU sanity check (survives Cisco AnyConnect).
// Hits the same student flow used at full scale, just lower concurrency.
import { SharedArray } from 'k6/data';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
import { studentFlow } from '/lib/flow.js';

const CSV_PATH = __ENV.SMOKE_CSV || '/data/students.csv';

const credentials = new SharedArray('smoke', function () {
  const raw = open(CSV_PATH);
  return papaparse.parse(raw, { header: true, skipEmptyLines: true }).data;
});

export const options = {
  vus: 50,
  duration: '60s',
  thresholds: {
    'http_req_failed': ['rate<0.10'],
  },
  insecureSkipTLSVerify: true,
};

export default function () {
  const idx = (__VU - 1 + __ITER) % credentials.length;
  const row = credentials[idx];
  studentFlow({ username: row.username, password: row.password });
}
