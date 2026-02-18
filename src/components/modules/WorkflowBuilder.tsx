import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Workflow node types
const nodeTypes = {
  trigger: 'Trigger (Tetikleyici)',
  delay: 'Delay (Bekleme)',
  voiceCall: 'Voice Call (Sesli Arama)',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  condition: 'Condition (Koşul)',
  database: 'Database',
  aiAnalysis: 'AI Analysis',
  end: 'End (Bitiş)',
};

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'input',
    data: { 
      label: 'ğŸ¯ Trigger: Customer Exit',
      description: 'Müşteri mağazadan çıktı'
    },
    position: { x: 250, y: 0 },
    style: {
      background: '#4F46E5',
      color: 'white',
      border: '2px solid #4338CA',
      borderRadius: '8px',
      padding: '10px',
    },
  },
  {
    id: '2',
    data: { 
      label: '⏰ Delay 60 minutes',
      description: '1 saat bekle'
    },
    position: { x: 250, y: 100 },
    style: {
      background: '#F59E0B',
      color: 'white',
      border: '2px solid #D97706',
      borderRadius: '8px',
      padding: '10px',
    },
  },
  {
    id: '3',
    data: { 
      label: 'ğŸŒ Check Nationality',
      description: 'Müşteri uyruğu kontrol et'
    },
    position: { x: 250, y: 200 },
    style: {
      background: '#10B981',
      color: 'white',
      border: '2px solid #059669',
      borderRadius: '8px',
      padding: '10px',
    },
  },
  {
    id: '4a',
    data: { 
      label: 'ğŸ“ Call (Turkish)',
      description: 'Türkçe sesli arama'
    },
    position: { x: 50, y: 300 },
    style: {
      background: '#EF4444',
      color: 'white',
      border: '2px solid #DC2626',
      borderRadius: '8px',
      padding: '10px',
    },
  },
  {
    id: '4b',
    data: { 
      label: 'ğŸ“ Call (Arabic)',
      description: 'Arapça sesli arama'
    },
    position: { x: 250, y: 300 },
    style: {
      background: '#EF4444',
      color: 'white',
      border: '2px solid #DC2626',
      borderRadius: '8px',
      padding: '10px',
    },
  },
  {
    id: '4c',
    data: { 
      label: 'ğŸ“ Call (Sorani)',
      description: 'Sorani Kürtçesi arama'
    },
    position: { x: 450, y: 300 },
    style: {
      background: '#EF4444',
      color: 'white',
      border: '2px solid #DC2626',
      borderRadius: '8px',
      padding: '10px',
    },
  },
  {
    id: '5',
    data: { 
      label: '❓ Answered?',
      description: 'Cevap verdi mi?'
    },
    position: { x: 250, y: 420 },
    style: {
      background: '#8B5CF6',
      color: 'white',
      border: '2px solid #7C3AED',
      borderRadius: '8px',
      padding: '10px',
    },
  },
  {
    id: '6',
    data: { 
      label: 'ğŸ’¬ WhatsApp Survey',
      description: 'WhatsApp anketi gönder'
    },
    position: { x: 450, y: 520 },
    style: {
      background: '#06B6D4',
      color: 'white',
      border: '2px solid #0891B2',
      borderRadius: '8px',
      padding: '10px',
    },
  },
  {
    id: '7',
    data: { 
      label: 'ğŸ’¾ Save Feedback',
      description: 'Feedback kaydet'
    },
    position: { x: 50, y: 520 },
    style: {
      background: '#10B981',
      color: 'white',
      border: '2px solid #059669',
      borderRadius: '8px',
      padding: '10px',
    },
  },
  {
    id: '8',
    type: 'output',
    data: { 
      label: '✅ End',
      description: 'İşlem tamamlandı'
    },
    position: { x: 250, y: 650 },
    style: {
      background: '#6B7280',
      color: 'white',
      border: '2px solid #4B5563',
      borderRadius: '8px',
      padding: '10px',
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e1-2',
    source: '1',
    target: '2',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e2-3',
    source: '2',
    target: '3',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e3-4a',
    source: '3',
    target: '4a',
    label: 'TR',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e3-4b',
    source: '3',
    target: '4b',
    label: 'AR',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e3-4c',
    source: '3',
    target: '4c',
    label: 'KU',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e4a-5',
    source: '4a',
    target: '5',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e4b-5',
    source: '4b',
    target: '5',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e4c-5',
    source: '4c',
    target: '5',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e5-7',
    source: '5',
    target: '7',
    label: '✅ Yes',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e5-6',
    source: '5',
    target: '6',
    label: '❌ No',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e6-8',
    source: '6',
    target: '8',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'e7-8',
    source: '7',
    target: '8',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
];

export function WorkflowBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addNewNode = (type: string) => {
    const newNode: Node = {
      id: `${nodes.length + 1}`,
      data: { label: type, description: 'Configure me' },
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      style: {
        background: '#6366F1',
        color: 'white',
        border: '2px solid #4F46E5',
        borderRadius: '8px',
        padding: '10px',
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const saveWorkflow = async () => {
    const workflow = {
      name: 'Customer Feedback Automation',
      trigger_type: 'customer_exit',
      nodes: nodes,
      edges: edges,
      is_active: true,
    };

    console.log('Saving workflow:', workflow);

    // TODO: Save to database
    alert('Workflow kaydedildi! ✅');
  };

  const testWorkflow = async () => {
    alert('Workflow test ediliyor... ⚡');
    
    // TODO: Execute workflow with test data
  };

  return (
    <div className="h-screen flex">
      {/* Sidebar - Node Palette */}
      <div className="w-64 bg-gray-100 border-r border-gray-300 p-4 overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">ğŸ“¦ Nodes</h2>
        
        <div className="space-y-2">
          {Object.entries(nodeTypes).map(([key, label]) => (
            <button
              key={key}
              onClick={() => addNewNode(label)}
              className="w-full text-left px-4 py-2 bg-white rounded-lg shadow hover:shadow-md hover:bg-blue-50 transition-all border border-gray-200"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-8 space-y-2">
          <button
            onClick={saveWorkflow}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
          >
            ğŸ’¾ Save Workflow
          </button>
          <button
            onClick={testWorkflow}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >
            ▶️ Test Run
          </button>
        </div>

        {/* Workflow Info */}
        <div className="mt-8 p-4 bg-white rounded-lg shadow">
          <h3 className="font-semibold mb-2">ℹ️ Workflow Info</h3>
          <div className="text-sm text-gray-600 space-y-1">
            <p>Nodes: {nodes.length}</p>
            <p>Connections: {edges.length}</p>
            <p>Status: <span className="text-green-600">Active</span></p>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-10">
          <h1 className="text-xl font-bold">ğŸ¤– Customer Feedback Automation</h1>
          <p className="text-sm text-gray-600">Drag nodes to create your workflow</p>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(event, node) => setSelectedNode(node)}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {/* Right Sidebar - Node Configuration */}
      {selectedNode && (
        <div className="w-80 bg-white border-l border-gray-300 p-4 overflow-y-auto">
          <h2 className="text-lg font-bold mb-4">⚙️ Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Node Type
              </label>
              <input
                type="text"
                value={selectedNode.data.label}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={selectedNode.data.description || ''}
                onChange={(e) => {
                  setNodes((nds) =>
                    nds.map((n) =>
                      n.id === selectedNode.id
                        ? { ...n, data: { ...n.data, description: e.target.value } }
                        : n
                    )
                  );
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
              />
            </div>

            {selectedNode.data.label.includes('Delay') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delay (minutes)
                </label>
                <input
                  type="number"
                  defaultValue={60}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            )}

            {selectedNode.data.label.includes('Call') && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Language
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="tr">Türkçe</option>
                    <option value="ar">العربية</option>
                    <option value="ku-sorani">کوردی سۆرانی</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Call Script
                  </label>
                  <textarea
                    placeholder="AI will generate based on language..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    rows={5}
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="record"
                    defaultChecked
                    className="mr-2"
                  />
                  <label htmlFor="record" className="text-sm text-gray-700">
                    Record call
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="transcribe"
                    defaultChecked
                    className="mr-2"
                  />
                  <label htmlFor="transcribe" className="text-sm text-gray-700">
                    Auto-transcribe
                  </label>
                </div>
              </>
            )}

            {selectedNode.data.label.includes('WhatsApp') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message Template
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                  <option>Customer Feedback Survey</option>
                  <option>Product Review Request</option>
                  <option>Service Rating</option>
                </select>
              </div>
            )}

            <button
              onClick={() => {
                setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                setSelectedNode(null);
              }}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              ğŸ—‘ï¸ Delete Node
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

