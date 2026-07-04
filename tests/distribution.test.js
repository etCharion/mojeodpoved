import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasContent,
  submissionTime,
  isFullDistribution,
  distributePeer,
  distributeTeacher
} from '../src/lib/distribution.js';

const ts = (millis) => ({ toMillis: () => millis });

const makeWork = (studentId, i, over = {}) => ({
  id: `A_${studentId}`,
  studentId,
  studentName: `Student ${studentId}`,
  classId: 'C1',
  content: { text: `<p>práce studenta ${studentId}</p>` },
  status: 'submitted',
  reviewCount: 0,
  assignedCount: 0,
  givenReviewsCount: 0,
  givenCompletedCount: 0,
  submittedAt: ts(1000 + i),
  createdAt: ts(i),
  ...over
});

// In-memory stand-in for the Firestore transaction in tryAssignReview:
// enforces the same limits and records the assignment.
class PeerWorld {
  constructor(works, N) {
    this.works = works;
    this.N = N;
    this.reviews = [];
  }

  assignFn = async (reviewerSub, candidate, targetLimit) => {
    const reviewer = this.works.find(w => w.studentId === reviewerSub.studentId);
    if (!reviewer) return false;
    if ((reviewer.givenReviewsCount || 0) >= targetLimit || (reviewer.givenReviewsCount || 0) >= this.N) return false;
    if ((candidate.assignedCount || 0) >= this.N) return false;
    if (this.reviews.some(r => r.reviewerId === reviewerSub.studentId && r.submissionId === candidate.id)) return false;

    this.reviews.push({
      id: `${reviewerSub.studentId}_${candidate.id}`,
      reviewerId: reviewerSub.studentId,
      submissionId: candidate.id,
      authorId: candidate.studentId,
      status: 'assigned'
    });
    candidate.assignedCount = (candidate.assignedCount || 0) + 1;
    reviewer.givenReviewsCount = (reviewer.givenReviewsCount || 0) + 1;
    return true;
  };

  run = (fullDistribution) => distributePeer(
    { submittedWorks: this.works, reviews: this.reviews, N: this.N, fullDistribution },
    this.assignFn
  );

  complete = (reviewerId) => {
    const rev = this.reviews.find(r => r.reviewerId === reviewerId && r.status === 'assigned');
    if (!rev) throw new Error(`no pending review for ${reviewerId}`);
    rev.status = 'completed';
    const reviewer = this.works.find(w => w.studentId === reviewerId);
    reviewer.givenCompletedCount = (reviewer.givenCompletedCount || 0) + 1;
  };
}

test('hasContent ignores empty and tag-only HTML', () => {
  assert.equal(hasContent({}), false);
  assert.equal(hasContent({ content: { text: '' } }), false);
  assert.equal(hasContent({ content: { text: '<p> </p><p></p>' } }), false);
  assert.equal(hasContent({ content: { text: '<p>a</p>' } }), true);
  assert.equal(hasContent({ content: { text: 'plain text' } }), true);
});

test('submissionTime prefers submittedAt over createdAt', () => {
  assert.equal(submissionTime({ submittedAt: ts(5), createdAt: ts(1) }), 5);
  assert.equal(submissionTime({ createdAt: ts(1) }), 1);
  assert.equal(submissionTime({}), 0);
});

test('isFullDistribution: closed submissions force full mode', () => {
  assert.equal(isFullDistribution({ allowSubmissions: false, submittedCount: 1, participantCount: 10 }), true);
});

test('isFullDistribution: explicit expected count wins', () => {
  assert.equal(isFullDistribution({ expectedCount: 10, classSize: 5, submittedCount: 9, participantCount: 9 }), false);
  assert.equal(isFullDistribution({ expectedCount: 10, classSize: 5, submittedCount: 10, participantCount: 10 }), true);
});

test('isFullDistribution: class roster used when no expected count', () => {
  // 20 enrolled, only 5 opened the assignment (participants) — not full yet
  assert.equal(isFullDistribution({ expectedCount: null, classSize: 20, submittedCount: 5, participantCount: 5 }), false);
  assert.equal(isFullDistribution({ expectedCount: null, classSize: 20, submittedCount: 20, participantCount: 20 }), true);
  // legacy fallback without class size
  assert.equal(isFullDistribution({ expectedCount: null, classSize: 0, submittedCount: 5, participantCount: 5 }), true);
});

test('full distribution: everyone gives and receives N, no self, no duplicates', async () => {
  const works = ['a', 'b', 'c', 'd', 'e'].map((id, i) => makeWork(id, i));
  const world = new PeerWorld(works, 3);
  await world.run(true);

  for (const w of works) {
    const given = world.reviews.filter(r => r.reviewerId === w.studentId);
    const received = world.reviews.filter(r => r.submissionId === w.id);
    assert.equal(given.length, 3, `${w.studentId} should give 3`);
    assert.equal(received.length, 3, `${w.studentId} should receive 3`);
    assert.ok(given.every(r => r.submissionId !== w.id), 'no self-review');
    assert.equal(new Set(given.map(r => r.submissionId)).size, given.length, 'no duplicate targets');
  }
});

test('rolling mode: one pending task at a time, next one after completion', async () => {
  const works = ['a', 'b', 'c', 'd'].map((id, i) => makeWork(id, i));
  const world = new PeerWorld(works, 3);

  await world.run(false);
  for (const w of works) {
    assert.equal(world.reviews.filter(r => r.reviewerId === w.studentId).length, 1);
  }

  // re-running without progress must not assign more
  await world.run(false);
  assert.equal(world.reviews.length, 4);

  // student 'a' completes → next run gives them exactly one more
  world.complete('a');
  await world.run(false);
  assert.equal(world.reviews.filter(r => r.reviewerId === 'a').length, 2);
  assert.equal(world.reviews.filter(r => r.reviewerId === 'b').length, 1);
});

test('empty submissions are never handed out for review', async () => {
  const works = [
    makeWork('a', 0),
    makeWork('b', 1),
    makeWork('c', 2, { content: { text: '<p> </p>' } })
  ];
  const world = new PeerWorld(works, 2);
  await world.run(true);

  const emptyWork = works.find(w => w.studentId === 'c');
  assert.equal(world.reviews.filter(r => r.submissionId === emptyWork.id).length, 0);
  // the empty submitter still reviews others
  assert.ok(world.reviews.filter(r => r.reviewerId === 'c').length > 0);
});

test('small cohort: N larger than available peers does not loop or overflow', async () => {
  const works = ['a', 'b'].map((id, i) => makeWork(id, i));
  const world = new PeerWorld(works, 3);
  await world.run(true);

  assert.equal(world.reviews.length, 2); // a↔b only
  for (const w of works) {
    assert.equal(world.reviews.filter(r => r.submissionId === w.id).length, 1);
  }
});

test('least-reviewed work is preferred', async () => {
  const works = ['a', 'b', 'c'].map((id, i) => makeWork(id, i));
  // pretend 'b' already carries an assigned review
  works[1].assignedCount = 1;
  const world = new PeerWorld(works, 3);
  await world.run(false);

  // 'a' picks earliest least-reviewed non-self: 'c' (0 reviews) over 'b' (1)
  const aReview = world.reviews.find(r => r.reviewerId === 'a');
  assert.equal(aReview.submissionId, 'A_c');
});

// --- teacher-provided texts mode ---

const makeText = (id, i, over = {}) => ({
  id: `T_${id}`,
  isTeacherText: true,
  label: `Text ${id}`,
  content: { text: `<p>text ${id}</p>` },
  ownerEmails: [],
  status: 'submitted',
  assignedCount: 0,
  createdAt: ts(i),
  ...over
});

const makeReviewer = (studentId, i, over = {}) => ({
  id: `A_${studentId}`,
  studentId,
  studentName: `Student ${studentId}`,
  classId: 'C1',
  email: `${studentId}@example.com`,
  status: 'reviewer',
  givenReviewsCount: 0,
  givenCompletedCount: 0,
  createdAt: ts(i),
  ...over
});

class TeacherWorld {
  constructor(texts, reviewers, N) {
    this.texts = texts;
    this.reviewers = reviewers;
    this.N = N;
    this.reviews = [];
  }

  assignFn = async (reviewerProfile, candidate) => {
    const reviewer = this.reviewers.find(r => r.studentId === reviewerProfile.studentId);
    if ((candidate.assignedCount || 0) >= this.N) return false;
    if ((reviewer.givenReviewsCount || 0) > (reviewer.givenCompletedCount || 0)) return false;
    if (this.reviews.some(r => r.reviewerId === reviewerProfile.studentId && r.submissionId === candidate.id)) return false;

    this.reviews.push({
      id: `${reviewerProfile.studentId}_${candidate.id}`,
      reviewerId: reviewerProfile.studentId,
      submissionId: candidate.id,
      status: 'assigned'
    });
    candidate.assignedCount = (candidate.assignedCount || 0) + 1;
    reviewer.givenReviewsCount = (reviewer.givenReviewsCount || 0) + 1;
    return true;
  };

  run = () => distributeTeacher(
    { texts: this.texts, reviewers: this.reviewers, reviews: this.reviews, N: this.N },
    this.assignFn
  );

  complete = (reviewerId) => {
    const rev = this.reviews.find(r => r.reviewerId === reviewerId && r.status === 'assigned');
    rev.status = 'completed';
    const reviewer = this.reviewers.find(r => r.studentId === reviewerId);
    reviewer.givenCompletedCount = (reviewer.givenCompletedCount || 0) + 1;
  };
}

test('teacher mode: one pending text per reviewer, per-text cap N respected', async () => {
  const texts = [makeText('x', 0), makeText('y', 1)];
  const reviewers = ['a', 'b', 'c'].map((id, i) => makeReviewer(id, i));
  const world = new TeacherWorld(texts, reviewers, 2);

  await world.run();
  for (const rv of reviewers) {
    assert.equal(world.reviews.filter(r => r.reviewerId === rv.studentId).length, 1);
  }
  for (const tx of texts) {
    assert.ok(world.reviews.filter(r => r.submissionId === tx.id).length <= 2);
  }

  // completing unlocks the next text; totals never exceed N per text
  world.complete('a');
  await world.run();
  const total = world.reviews.length;
  assert.ok(total <= texts.length * 2, 'texts never over-assigned');
  assert.equal(world.reviews.filter(r => r.reviewerId === 'a').length, 2);
});

test('teacher mode: a reviewer never gets a text they own', async () => {
  const texts = [
    makeText('x', 0, { ownerEmails: ['a@example.com'] }),
    makeText('y', 1)
  ];
  const reviewers = [makeReviewer('a', 0)];
  const world = new TeacherWorld(texts, reviewers, 3);

  await world.run();
  world.complete('a');
  await world.run();

  const aTargets = world.reviews.filter(r => r.reviewerId === 'a').map(r => r.submissionId);
  assert.deepEqual(aTargets, ['T_y'], 'only the non-owned text is assigned');
});
