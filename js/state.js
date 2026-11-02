export const state = {
  db: null,
  route: 'dashboard',
  selectedInvestigationId: null,
  selectedEntity: null,
  filters: {
    status: 'all',
    category: 'all',
    search: ''
  },
  settings: {
    theme: 'dark',
    compactMode: false,
    sidebarCollapsed: false,
    fontSize: 1,
    animation: true,
    databaseName: 'blackbox-db'
  }
};

export function setRoute(route) {
  state.route = route;
}
