import { describe, expect, it } from 'vitest';
import { resolvePublicationSessionMapping } from '@/lib/managementPublicationPreview';

describe('M19.9 publication comparison continuity', () => {
  it('ilk managed publication öncesinde bootstrap evidence kullanır', () => {
    const result = resolvePublicationSessionMapping({
      publicationNumber: null,
      publicationSessions: [],
      requirementLineage: [],
      bootstrapEvidence: [
        {
          requirement_id: 'requirement-current',
          source_session_id: 'session-bootstrap',
        },
      ],
    });

    expect(result.mappingSource).toBe('BOOTSTRAP_EVIDENCE');
    expect(result.publicationNumber).toBeNull();
    expect(result.sourceMappingSessionCount).toBe(1);
    expect(result.missingRequirementMappingCount).toBe(0);
    expect(result.activeMapping).toEqual([
      {
        requirement_id: 'requirement-current',
        source_session_id: 'session-bootstrap',
      },
    ]);
  });

  it('managed publication sonrasında parent requirement mappingini yeni DRAFT child requirementa taşır', () => {
    const result = resolvePublicationSessionMapping({
      publicationNumber: 1,
      publicationSessions: [
        {
          requirement_id: 'requirement-published-a',
          session_id: 'session-published-a',
        },
        {
          requirement_id: 'requirement-published-b',
          session_id: 'session-published-b',
        },
      ],
      requirementLineage: [
        {
          parent_requirement_id: 'requirement-published-a',
          child_requirement_id: 'requirement-draft-a',
        },
        {
          parent_requirement_id: 'requirement-published-b',
          child_requirement_id: 'requirement-draft-b',
        },
      ],
      bootstrapEvidence: [
        {
          requirement_id: 'legacy-bootstrap',
          source_session_id: 'legacy-session',
        },
      ],
    });

    expect(result.mappingSource).toBe('MANAGED_PUBLICATION');
    expect(result.publicationNumber).toBe(1);
    expect(result.sourceMappingSessionCount).toBe(2);
    expect(result.missingRequirementMappingCount).toBe(0);
    expect(result.activeMapping).toEqual([
      {
        requirement_id: 'requirement-draft-a',
        source_session_id: 'session-published-a',
      },
      {
        requirement_id: 'requirement-draft-b',
        source_session_id: 'session-published-b',
      },
    ]);
  });

  it('eksik lineage mappingini sessizce sağlam saymaz', () => {
    const result = resolvePublicationSessionMapping({
      publicationNumber: 2,
      publicationSessions: [
        {
          requirement_id: 'requirement-published-a',
          session_id: 'session-published-a',
        },
        {
          requirement_id: 'requirement-published-missing',
          session_id: 'session-published-missing',
        },
      ],
      requirementLineage: [
        {
          parent_requirement_id: 'requirement-published-a',
          child_requirement_id: 'requirement-draft-a',
        },
      ],
      bootstrapEvidence: [],
    });

    expect(result.mappingSource).toBe('MANAGED_PUBLICATION');
    expect(result.sourceMappingSessionCount).toBe(2);
    expect(result.missingRequirementMappingCount).toBe(1);
    expect(result.activeMapping).toEqual([
      {
        requirement_id: 'requirement-draft-a',
        source_session_id: 'session-published-a',
      },
    ]);
  });
});
