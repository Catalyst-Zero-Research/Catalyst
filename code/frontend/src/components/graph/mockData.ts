export const mockData = {
  nodes: [] as any[],
  links: [] as any[]
};

const clusters = [
  { id: 'perovskites', name: 'Perovskites', color: '#0ea5e9', count: 40, x: 0, y: -100 },
  { id: 'spinels', name: 'Spinels', color: '#22c55e', count: 30, x: -150, y: 50 },
  { id: 'nitrides', name: 'Nitride compounds', color: '#f97316', count: 35, x: 0, y: 150 },
  { id: 'heusler', name: 'Heusler', color: '#a855f7', count: 25, x: -100, y: -150 },
  { id: 'chalcogenides', name: 'Chalcogenides', color: '#eab308', count: 30, x: 150, y: 50 },
];

let nodeIdCounter = 0;

clusters.forEach(cluster => {
  const clusterNodes: any[] = [];
  
  // Center node for cluster (invisible or large)
  const centerNode = {
    id: `center-${cluster.id}`,
    cluster: cluster.id,
    color: cluster.color,
    val: 5,
    name: cluster.name,
    isCenter: true,
    fx: cluster.x, // pin center to specific position
    fy: cluster.y
  };
  mockData.nodes.push(centerNode);

  // Generate nodes around center
  for (let i = 0; i < cluster.count; i++) {
    const node = {
      id: `mp-${nodeIdCounter++}`,
      cluster: cluster.id,
      color: cluster.color,
      val: Math.random() * 2 + 1,
      name: `Material ${nodeIdCounter}`
    };
    
    // Specifically define LaFeO3
    if (cluster.id === 'perovskites' && i === 0) {
      node.id = 'mp-1001654';
      node.name = 'LaFeO3';
      node.val = 6;
    }
    
    mockData.nodes.push(node);
    clusterNodes.push(node);
    
    // Link to center
    mockData.links.push({
      source: node.id,
      target: centerNode.id,
      value: 1
    });
    
    // Link to random sibling
    if (i > 0) {
      mockData.links.push({
        source: node.id,
        target: clusterNodes[Math.floor(Math.random() * i)].id,
        value: 0.5
      });
    }
  }
});

// Inter-cluster links
mockData.links.push({ source: 'mp-1001654', target: 'center-spinels', value: 0.2, isInterCluster: true });
mockData.links.push({ source: 'mp-1001654', target: 'center-nitrides', value: 0.2, isInterCluster: true });
mockData.links.push({ source: 'mp-1001654', target: 'center-chalcogenides', value: 0.2, isInterCluster: true });
