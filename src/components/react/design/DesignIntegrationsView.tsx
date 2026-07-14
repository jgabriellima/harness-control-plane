import React from 'react';

export default function DesignIntegrationsView() {
  return (
    <div className="h-full overflow-auto bg-[#fbfbfa] px-8 py-10" data-testid="design-integrations-view">
      <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-gray-400">Integrations</p>
      <h1 className="mt-2 font-serif text-[36px] text-gray-900">Integrations</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-gray-500">
        Connect external systems and MCP tools, and use the design studio from any IDE or automation.
      </p>
      <div className="mt-8 rounded-2xl border border-dashed border-[#ddd] bg-white px-6 py-12 text-[14px] text-gray-500">
        Connector configuration bridges to the existing runtime integrations layer.
      </div>
    </div>
  );
}
