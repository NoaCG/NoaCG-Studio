import { deleteSavedVideoProject, type SavedVideoRecord } from '../../../model/videoProject';
import { IconFilm, IconTrash } from '../../icons';

/** The saved-video rows, shared by the dashboard's short list and the full Videos section. */
export function VideoList({
  videos,
  onOpen,
  onChanged,
}: {
  videos: SavedVideoRecord[];
  onOpen: (v: SavedVideoRecord) => void;
  onChanged: () => void;
}) {
  return (
    <>
      {videos.map((v) => (
        <div className="lib-row lib-row-flat" key={v.id}>
          <span className="lib-row-icon" aria-hidden="true"><IconFilm size={20} /></span>
          <div className="lib-info">
            <strong>{v.name}</strong>
            <span className="muted">{v.project.engine} · {new Date(v.updatedAt).toLocaleDateString()}</span>
          </div>
          <div className="lib-actions">
            <button className="primary" onClick={() => onOpen(v)} title="Open in the video editor">Open</button>
          </div>
          <button onClick={() => { deleteSavedVideoProject(v.id); onChanged(); }} title="Delete" aria-label={`Delete ${v.name}`}>
            <IconTrash />
          </button>
        </div>
      ))}
    </>
  );
}

export default function VideosSection({
  videos,
  onOpen,
  onChanged,
}: {
  videos: SavedVideoRecord[];
  onOpen: (v: SavedVideoRecord) => void;
  onChanged: () => void;
}) {
  return (
    <>
      <h2><IconFilm size={18} /> Videos <span className="muted">({videos.length})</span></h2>
      {videos.length === 0 && (
        <p className="hint">Nothing yet. Create one with “Video or animation with AI” in the wizard.</p>
      )}
      <VideoList videos={videos} onOpen={onOpen} onChanged={onChanged} />
    </>
  );
}
