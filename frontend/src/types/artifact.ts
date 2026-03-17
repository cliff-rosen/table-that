export interface Artifact {
  id: number;
  title: string;
  description?: string;
  artifact_type: string;
  status?: string;
  category?: string;
  priority?: string;
  area?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ArtifactCategory {
  id: number;
  name: string;
}
