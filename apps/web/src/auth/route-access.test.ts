import assert from "node:assert/strict";
import test from "node:test";

import { isRoleRouteAllowed, roleRouteMap } from "./route-access.js";

test("role route map resolves shell routes", () => {
  assert.equal(roleRouteMap.ADMIN, "/panel/admin");
  assert.equal(roleRouteMap.RESIDENT, "/panel/resident");
  assert.equal(roleRouteMap.SECURITY, "/panel/security");
});

test("role route guard allows own routes and blocks others", () => {
  assert.equal(isRoleRouteAllowed("ADMIN", "/panel/admin"), true);
  assert.equal(isRoleRouteAllowed("RESIDENT", "/panel/security"), false);
});
