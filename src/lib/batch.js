import { writeBatch } from 'firebase/firestore';
import { db } from './firebase';

// Commit a list of writes atomically per chunk. Firestore caps a single
// batch at 500 writes, so very large fan-outs (deleting a whole assignment)
// are split; within one chunk everything applies or nothing does.
// op: { type: 'delete', ref } | { type: 'update', ref, data }
export const commitBatched = async (ops) => {
  const LIMIT = 450;
  for (let i = 0; i < ops.length; i += LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + LIMIT)) {
      if (op.type === 'delete') batch.delete(op.ref);
      else batch.update(op.ref, op.data);
    }
    await batch.commit();
  }
};
