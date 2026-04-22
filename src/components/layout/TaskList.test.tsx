import { render, screen } from '@testing-library/react';
import '@/i18n';
import { TaskList } from '@/components/layout/TaskList';
import { useTaskStore } from '@/store/tasks';
import { useUIStore } from '@/store/ui';
import { useProjectStore } from '@/store/projects';
import * as repositoryModule from '@/store/repository';

const mockRepository = {} as any;

beforeEach(() => {
  vi.spyOn(repositoryModule, 'getRepository').mockReturnValue(mockRepository);
  useProjectStore.setState({ projects: [], loadProjects: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(), deleteProject: vi.fn() });
  useUIStore.setState({
    selectedProjectId: 'today',
    selectedTaskId: null,
    activeFilters: {},
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
    setSelectedProject: vi.fn(),
    setSelectedTask: vi.fn(),
    setFilters: vi.fn(),
  });
  useTaskStore.setState({
    tasks: [],
    loading: false,
    loadTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    completeTask: vi.fn(),
    uncompleteTask: vi.fn(),
    deleteTask: vi.fn(),
    reorderTasks: vi.fn(),
  });
});

describe('TaskList header progress', () => {
  it('shows progress bar in today view when tasks exist', () => {
    useTaskStore.setState((s) => ({
      ...s,
      tasks: [
        { id: '1', title: 'Task 1', completedAt: null, dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 0, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: '2', title: 'Task 2', completedAt: '2026-04-17', dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 1, sortOrder: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
    }));
    render(<TaskList />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('does not show progress bar when no tasks', () => {
    useTaskStore.setState((s) => ({ ...s, tasks: [] }));
    render(<TaskList />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows remaining count badge in today view', () => {
    useTaskStore.setState((s) => ({
      ...s,
      tasks: [
        { id: '1', title: 'Task 1', completedAt: null, dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 0, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: '2', title: 'Task 2', completedAt: '2026-04-17', dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 1, sortOrder: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
    }));
    render(<TaskList />);
    expect(screen.getByText(/1 remaining/)).toBeInTheDocument();
  });

  it('does not show progress bar in a project view', () => {
    useUIStore.setState((s) => ({ ...s, selectedProjectId: 'proj-1' }));
    useTaskStore.setState((s) => ({
      ...s,
      tasks: [
        { id: '1', title: 'Task 1', completedAt: null, dueDate: null, priority: 'none', tags: [], projectId: 'proj-1', description: '', position: 0, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
    }));
    render(<TaskList />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows progress bar in all-tasks view (selectedProjectId undefined)', () => {
    useUIStore.setState((s) => ({ ...s, selectedProjectId: undefined }));
    useTaskStore.setState((s) => ({
      ...s,
      tasks: [
        { id: '1', title: 'Task 1', completedAt: null, dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 0, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
    }));
    render(<TaskList />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
