import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPaymentStatusTransition,
  canTransitionPaymentStatus,
  terminalPaymentStatuses
} from "./payment-state.js";

test("payment status allows normal payment and fulfillment path", () => {
  assert.equal(canTransitionPaymentStatus("CREATED", "PAYING"), true);
  assert.equal(canTransitionPaymentStatus("PAYING", "PAID"), true);
  assert.equal(canTransitionPaymentStatus("PAID", "FULFILLED"), true);
});

test("payment status rejects moving terminal states back to active states", () => {
  assert.equal(canTransitionPaymentStatus("CANCELLED", "PAYING"), false);
  assert.equal(canTransitionPaymentStatus("REFUNDED", "FULFILLED"), false);
  assert.throws(() => assertPaymentStatusTransition("FAILED", "PAID"), /cannot transition/);
});

test("terminal status list is explicit", () => {
  assert.deepEqual(terminalPaymentStatuses(), ["FAILED", "CANCELLED", "REFUNDED"]);
});
