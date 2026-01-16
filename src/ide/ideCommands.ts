export type IdeCommand =
  | { type: 'view.toggleSidebar' }
  | { type: 'view.showActivity'; activity: 'explorer' | 'diagrams' | 'analysis' | 'metamodel' | 'settings' }
  | { type: 'view.toggleBottomPanel' }
  | { type: 'view.resetLayout' }
  | { type: 'view.fullscreen.toggle' }
  | { type: 'studio.exit' }
  | { type: 'navigation.openRoute'; path: string }
  | {
      type: 'navigation.openWorkspace';
      args:
        | { type: 'analysis'; kind: 'impact' | 'dependency' | 'gap' | 'roadmap' }
        | { type: 'analysisResult'; resultId: string }
        | { type: 'view'; viewId: string }
        | { type: 'catalog'; catalog: any }
        | { type: 'object'; objectId: string; objectType: string; name: string };
    }
  | { type: 'workspace.closeMatchingTabs'; prefix: string }
  | { type: 'workspace.resetTabs' };

export const IDE_COMMAND_EVENT = 'ide:command';

export function dispatchIdeCommand(cmd: IdeCommand) {
  try {
    window.dispatchEvent(new CustomEvent<IdeCommand>(IDE_COMMAND_EVENT, { detail: cmd }));
  } catch {
    // Best-effort only.
  }
}
