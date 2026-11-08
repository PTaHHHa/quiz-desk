"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { networkInfo, lanAddresses, isHotspot } = require("../server/http-utils");

const nic = (...ips) => ({ eth: ips.map(address => ({ family: "IPv4", internal: false, address })) });

test("hotspot is detected by its well-known gateway address", () => {
  for (const ip of ["192.168.137.1", "192.168.2.1", "10.42.0.1"]) assert.equal(isHotspot(["192.168.1.20", ip]), true, ip);
  assert.equal(isHotspot(["192.168.1.20", "10.0.0.5"]), false);
  assert.equal(isHotspot([]), false);
});

test("the hotspot address comes first in the join list", () => {
  const info = networkInfo(3000, nic("192.168.1.20", "10.0.0.5", "192.168.137.1"));
  assert.equal(info.hotspot, true);
  assert.deepEqual(info.join, ["http://192.168.137.1:3000/", "http://192.168.1.20:3000/", "http://10.0.0.5:3000/"]);
});

test("without a hotspot the order is unchanged and the flag is off", () => {
  const info = networkInfo(3000, nic("10.0.0.5", "192.168.1.20"));
  assert.equal(info.hotspot, false);
  assert.deepEqual(info.join, ["http://192.168.1.20:3000/", "http://10.0.0.5:3000/"]);
});

test("loopback, IPv6 and duplicate addresses are ignored", () => {
  const ifaces = {
    lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
    a: [{ family: "IPv6", internal: false, address: "fe80::1" }, { family: "IPv4", internal: false, address: "192.168.1.20" }],
    b: [{ family: "IPv4", internal: false, address: "192.168.1.20" }]
  };
  assert.deepEqual(lanAddresses(ifaces), ["192.168.1.20"]);
  assert.deepEqual(networkInfo(3000, {}), { join: [], hotspot: false });
});
