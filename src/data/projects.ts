export interface Project {
  title: string;
  description: string;
  url: string;
  tags: string[];
}
export const projects: Project[] = [{
  title: 'Weather MCP Server',
  description: '用 TypeScript 实现的天气查询 MCP 服务，探索工具与语言模型之间的连接。',
  url: 'https://github.com/yxsci66/weather_mcp_server',
  tags: ['TypeScript', 'MCP'],
}];
