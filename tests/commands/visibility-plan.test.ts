import { describe, it, expect } from 'vitest';
import { _buildVisibilityPlan, type VisibilityAction } from '../../src/commands/visibility.js';

/**
 * Unit tests for the pure visibility planner. The planner takes the
 * current repo+Pages state and a target mode, returns the ordered list
 * of atomic actions that move the repo into that state. Empty list
 * means "already at target — nothing to do".
 *
 * These tests pin the planner's decisions per (current state, target)
 * pair. The integration tests in visibility.test.ts assert that the
 * executor applies those actions correctly via mocked GitHub APIs.
 */

const kinds = (actions: VisibilityAction[]): string[] => actions.map(a => a.kind);

describe('_buildVisibilityPlan — already at target (no-op)', () => {
  it('returns empty for public → public when state matches and deploy.yml exists', () => {
    expect(_buildVisibilityPlan({
      target: 'public',
      currentVis: 'public',
      hasPages: true,
      pagesVis: 'public',
      needDeploy: false,
    })).toEqual([]);
  });

  it('returns empty for private → private with no Pages and no deploy needed', () => {
    expect(_buildVisibilityPlan({
      target: 'private',
      currentVis: 'private',
      hasPages: false,
      pagesVis: null,
      needDeploy: false,
    })).toEqual([]);
  });

  it('returns empty for auth-gated → auth-gated when state matches and deploy.yml exists', () => {
    expect(_buildVisibilityPlan({
      target: 'auth-gated',
      currentVis: 'private',
      hasPages: true,
      pagesVis: 'private',
      needDeploy: false,
    })).toEqual([]);
  });
});

describe('_buildVisibilityPlan — target: public', () => {
  it('private repo, no Pages, no deploy.yml → addDeployWorkflow + setRepoVisibility(public) + enablePages', () => {
    const actions = _buildVisibilityPlan({
      target: 'public',
      currentVis: 'private',
      hasPages: false,
      pagesVis: null,
      needDeploy: true,
    });
    expect(kinds(actions)).toEqual(['addDeployWorkflow', 'setRepoVisibility', 'enablePages']);
    expect(actions[1]).toEqual({ kind: 'setRepoVisibility', target: 'public' });
  });

  it('private repo, has private Pages, deploy.yml exists → setRepoVisibility(public) + setPagesVisibility(public)', () => {
    const actions = _buildVisibilityPlan({
      target: 'public',
      currentVis: 'private',
      hasPages: true,
      pagesVis: 'private',
      needDeploy: false,
    });
    expect(kinds(actions)).toEqual(['setRepoVisibility', 'setPagesVisibility']);
    expect(actions[0]).toEqual({ kind: 'setRepoVisibility', target: 'public' });
    expect(actions[1]).toEqual({ kind: 'setPagesVisibility', target: 'public' });
  });

  it('public repo, no Pages, deploy.yml exists → enablePages only', () => {
    const actions = _buildVisibilityPlan({
      target: 'public',
      currentVis: 'public',
      hasPages: false,
      pagesVis: null,
      needDeploy: false,
    });
    expect(kinds(actions)).toEqual(['enablePages']);
  });
});

describe('_buildVisibilityPlan — target: private', () => {
  it('public repo with public Pages → setRepoVisibility(private) + disablePages', () => {
    const actions = _buildVisibilityPlan({
      target: 'private',
      currentVis: 'public',
      hasPages: true,
      pagesVis: 'public',
      needDeploy: false,
    });
    expect(kinds(actions)).toEqual(['setRepoVisibility', 'disablePages']);
    expect(actions[0]).toEqual({ kind: 'setRepoVisibility', target: 'private' });
  });

  it('public repo, no Pages → setRepoVisibility(private) only', () => {
    const actions = _buildVisibilityPlan({
      target: 'private',
      currentVis: 'public',
      hasPages: false,
      pagesVis: null,
      needDeploy: false,
    });
    expect(kinds(actions)).toEqual(['setRepoVisibility']);
  });

  it('never plans addDeployWorkflow for the private target (needDeploy is false by construction)', () => {
    // The caller computes needDeploy based on target; private never sets it true.
    const actions = _buildVisibilityPlan({
      target: 'private',
      currentVis: 'public',
      hasPages: true,
      pagesVis: 'public',
      needDeploy: false,
    });
    expect(actions.find(a => a.kind === 'addDeployWorkflow')).toBeUndefined();
  });
});

describe('_buildVisibilityPlan — target: auth-gated', () => {
  it('private repo, no Pages, no deploy.yml → addDeployWorkflow + enablePages + setPagesVisibility(private)', () => {
    const actions = _buildVisibilityPlan({
      target: 'auth-gated',
      currentVis: 'private',
      hasPages: false,
      pagesVis: null,
      needDeploy: true,
    });
    expect(kinds(actions)).toEqual(['addDeployWorkflow', 'enablePages', 'setPagesVisibility']);
    expect(actions[2]).toEqual({ kind: 'setPagesVisibility', target: 'private' });
  });

  it('public repo with public Pages, deploy.yml exists → setRepoVisibility(private) + setPagesVisibility(private)', () => {
    const actions = _buildVisibilityPlan({
      target: 'auth-gated',
      currentVis: 'public',
      hasPages: true,
      pagesVis: 'public',
      needDeploy: false,
    });
    expect(kinds(actions)).toEqual(['setRepoVisibility', 'setPagesVisibility']);
    expect(actions[0]).toEqual({ kind: 'setRepoVisibility', target: 'private' });
    expect(actions[1]).toEqual({ kind: 'setPagesVisibility', target: 'private' });
  });

  it('private repo with private Pages, no deploy.yml → addDeployWorkflow only', () => {
    const actions = _buildVisibilityPlan({
      target: 'auth-gated',
      currentVis: 'private',
      hasPages: true,
      pagesVis: 'private',
      needDeploy: true,
    });
    expect(kinds(actions)).toEqual(['addDeployWorkflow']);
  });
});

describe('_buildVisibilityPlan — ordering invariants', () => {
  it('addDeployWorkflow always comes first when present', () => {
    const allTargets = ['public', 'private', 'auth-gated'] as const;
    for (const target of allTargets) {
      const actions = _buildVisibilityPlan({
        target,
        currentVis: 'public',
        hasPages: true,
        pagesVis: 'public',
        needDeploy: true,
      });
      if (actions.some(a => a.kind === 'addDeployWorkflow')) {
        expect(actions[0]?.kind).toBe('addDeployWorkflow');
      }
    }
  });

  it('setRepoVisibility comes before any Pages action', () => {
    const actions = _buildVisibilityPlan({
      target: 'public',
      currentVis: 'private',
      hasPages: true,
      pagesVis: 'private',
      needDeploy: false,
    });
    const repoIdx = actions.findIndex(a => a.kind === 'setRepoVisibility');
    const pagesIdx = actions.findIndex(a => a.kind.startsWith('setPages') || a.kind === 'enablePages' || a.kind === 'disablePages');
    if (repoIdx >= 0 && pagesIdx >= 0) {
      expect(repoIdx).toBeLessThan(pagesIdx);
    }
  });
});
