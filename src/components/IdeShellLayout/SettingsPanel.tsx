import React from 'react';
import { message } from '@/ea/eaConsole';
import { dispatchIdeCommand } from '@/ide/ideCommands';

const SettingsPanel: React.FC = () => {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Settings</div>
      <div style={{ opacity: 0.75, marginBottom: 12 }}>
        Workspace-level preferences and layout controls.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a
          onClick={() => {
            dispatchIdeCommand({ type: 'view.resetLayout' });
            message.success({ content: 'Layout reset.', domain: 'system' });
          }}
        >
          Reset layout
        </a>
        <a
          onClick={() => {
            dispatchIdeCommand({ type: 'view.toggleBottomPanel' });
          }}
        >
          Toggle bottom panel
        </a>
        <a
          onClick={() => {
            dispatchIdeCommand({ type: 'view.fullscreen.toggle' });
          }}
        >
          Toggle fullscreen workspace
        </a>
      </div>

      {/* User management UI intentionally omitted (implicit local user). */}
    </div>
  );
};

export default SettingsPanel;
