// Local storage backend mock for frontend-only mode
// This provides the same interface as the real backend client but stores data locally

interface ProgressData {
  curriculumId: string;
  completedCourses: string[];
  currentSemester?: number;
  lastUpdated: string;
}

interface UserInfo {
  id: string;
  email?: string;
  name?: string;
}

// Mock backend client that uses localStorage
export const mockBackendClient = {
  progress: {
    async loadProgress(params: { curriculumId: string }): Promise<ProgressData | null> {
      try {
        const stored = localStorage.getItem(`progress_${params.curriculumId}`);
        return stored ? JSON.parse(stored) : {
          curriculumId: params.curriculumId,
          completedCourses: [],
          lastUpdated: new Date().toISOString()
        };
      } catch (error) {
        console.warn('Error loading progress from localStorage:', error);
        return {
          curriculumId: params.curriculumId,
          completedCourses: [],
          lastUpdated: new Date().toISOString()
        };
      }
    },

    async saveProgress(params: ProgressData): Promise<void> {
      try {
        const dataToSave = {
          ...params,
          lastUpdated: new Date().toISOString()
        };
        localStorage.setItem(`progress_${params.curriculumId}`, JSON.stringify(dataToSave));
      } catch (error) {
        console.error('Error saving progress to localStorage:', error);
        throw error;
      }
    }
  },

  user: {
    async getUserInfo(): Promise<UserInfo> {
      // Return mock user info - in a real app this would come from Clerk
      return {
        id: 'local_user',
        email: 'user@local.dev',
        name: 'Local User'
      };
    }
  }
};

// Function to determine if we should use the real backend or the mock
export function shouldUseRealBackend(): boolean {
  const clientTarget = import.meta.env.VITE_CLIENT_TARGET;
  return !!(clientTarget && clientTarget.trim() !== '');
}