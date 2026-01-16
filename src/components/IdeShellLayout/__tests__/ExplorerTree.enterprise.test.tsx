import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ExplorerTree from '../ExplorerTree';
import { EaRepository } from '@/pages/dependency-view/utils/eaRepository';

let mockEaRepositoryState: any = {};
let mockIdeSelectionState: any = {};

jest.mock('@umijs/max', () => ({
  useModel: () => ({ initialState: { currentUser: { name: 'test', userid: 'test' } } }),
}));

jest.mock('../index', () => ({
  useIdeShell: () => ({
    openRouteTab: jest.fn(),
    openWorkspaceTab: jest.fn(),
    openPropertiesPanel: jest.fn(),
    openStudioEntry: jest.fn(),
    hierarchyEditingEnabled: false,
  }),
}));

jest.mock('@/ide/IdeSelectionContext', () => ({
  useIdeSelection: () => mockIdeSelectionState,
}));

jest.mock('@/ea/EaRepositoryContext', () => ({
  useEaRepository: () => mockEaRepositoryState,
}));

jest.mock('@/ea/useSeedSampleData', () => ({
  useSeedSampleData: () => ({
    openSeedSampleDataModal: jest.fn(),
    isRepoEmpty: false,
    hasRepository: true,
  }),
}));

jest.mock('../../../backend/views/ViewRepositoryStore', () => ({
  getViewRepository: () => ({ listAllViews: () => [] }),
  deleteView: jest.fn(),
  updateViewRoot: jest.fn(),
}));

jest.mock('@/diagram-studio/view-runtime/ViewStore', () => ({
  ViewStore: { list: () => [] },
}));

jest.mock('../../../backend/baselines/BaselineStore', () => ({
  listBaselines: () => [],
  getBaselineById: () => null,
}));

jest.mock('../../../backend/roadmap/PlateauStore', () => ({
  listPlateaus: () => [],
  getPlateauById: () => null,
}));

jest.mock('../../../backend/roadmap/RoadmapStore', () => ({
  listRoadmaps: () => [],
  getRoadmapById: () => null,
}));

describe('ExplorerTree Enterprise cardinality', () => {
  beforeEach(() => {
    const repo = new EaRepository();
    repo.addObject({ id: 'ent-1', type: 'Enterprise', attributes: { name: 'Enterprise One' } });
    repo.addObject({ id: 'ent-2', type: 'Enterprise', attributes: { name: 'Enterprise Two' } });
    repo.addObject({ id: 'ent-3', type: 'Enterprise', attributes: { name: 'Enterprise Three' } });

    mockEaRepositoryState = {
      eaRepository: repo,
      setEaRepository: jest.fn(),
      trySetEaRepository: jest.fn(() => ({ ok: true })),
      metadata: {
        repositoryName: 'Test Repo',
        organizationName: 'Test Org',
        architectureScope: 'Enterprise',
        referenceFramework: 'Custom',
        governanceMode: 'Advisory',
        lifecycleCoverage: 'Both',
        timeHorizon: '1–3 years',
        owner: { userId: 'test' },
        createdAt: new Date().toISOString(),
        frameworkConfig: {
          custom: {
            enabledObjectTypes: ['Enterprise'],
            enabledRelationshipTypes: [],
          },
        },
      },
      initializationState: { status: 'initialized', reason: null },
    };

    mockIdeSelectionState = {
      selection: { kind: 'none', keys: [] },
      setSelection: jest.fn(),
      setSelectedElement: jest.fn(),
      setActiveElement: jest.fn(),
    };
  });

  test('shows multiple Enterprises and keeps create enabled', async () => {
    render(<ExplorerTree />);

    expect(await screen.findByText('Enterprise One')).toBeInTheDocument();
    expect(await screen.findByText('Enterprise Two')).toBeInTheDocument();
    expect(await screen.findByText('Enterprise Three')).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Enterprises'));

    const createItem = await screen.findByText('+ Create Enterprise');
    expect(createItem.closest('.ant-dropdown-menu-item-disabled')).toBeNull();
    expect(createItem.getAttribute('aria-disabled')).not.toBe('true');
  });
});
