// Batch <-> WhatsApp group helpers.
const store = require('./store');

function listBatchNames() {
  const db = store.load();
  return [...new Set(Object.values(db.students).map((s) => s.batch).filter(Boolean))];
}

function groupIdFor(batchName) {
  const db = store.load();
  return db.batches[batchName]?.groupId || null;
}

function mapBatch(batchName, groupId, groupName) {
  store.update((db) => { db.batches[batchName] = { groupId, groupName: groupName || '', mappedAt: new Date().toISOString() }; });
}

function studentsInBatch(batchName) {
  const db = store.load();
  return Object.values(db.students).filter((s) => s.batch === batchName);
}

module.exports = { listBatchNames, groupIdFor, mapBatch, studentsInBatch };
