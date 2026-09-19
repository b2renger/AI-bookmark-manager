import { applyOps } from '../ops/applyOp.js';
import { SHAREABLE_ENTITIES, type OpContext, type OpInput, type ShareableEntity } from '../ops/types.js';
import type { ApplyOpsResponse, OpInputDto } from './dto.js';

// library:applyOps (channel 5). The renderer may propose ops; it may not invent entities. Anything
// outside the shareable set is refused here rather than deeper down, where the error would be a
// projector lookup failure with no useful message.

const ALLOWED = new Set<string>(SHAREABLE_ENTITIES);
const OP_KINDS = new Set(['create', 'set', 'delete', 'move', 'link', 'unlink']);

export function applyOpsFromDto(ctx: OpContext, ops: OpInputDto[]): ApplyOpsResponse {
  const inputs: OpInput[] = ops.map((dto, i) => {
    if (!ALLOWED.has(dto.entity)) {
      throw new Error(`applyOps: ops[${i}].entity ${JSON.stringify(dto.entity)} is not shareable`);
    }
    if (!OP_KINDS.has(dto.op)) {
      throw new Error(`applyOps: ops[${i}].op ${JSON.stringify(dto.op)} is not an op kind`);
    }
    if (typeof dto.entityId !== 'string' || dto.entityId === '') {
      throw new Error(`applyOps: ops[${i}] has no entityId`);
    }
    const input: OpInput = {
      collectionId: dto.collectionId,
      entity: dto.entity as ShareableEntity,
      entityId: dto.entityId,
      op: dto.op,
    };
    if (dto.field !== undefined) input.field = dto.field;
    if (dto.value !== undefined) input.value = dto.value;
    if (dto.runId !== undefined) input.runId = dto.runId;
    return input;
  });

  const applied = applyOps(ctx, inputs);
  return {
    opIds: applied.map((op) => op.id),
    hlc: applied.length > 0 ? applied[applied.length - 1]!.hlc : (ctx.hlc.last() ?? ''),
  };
}
