import { BadRequestException } from "@nestjs/common";

export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(Number(query.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function requireReason(body: Record<string, unknown>) {
  if (!body.reason || String(body.reason).trim().length < 3) {
    throw new BadRequestException("Reason is required for sensitive actions");
  }
}

