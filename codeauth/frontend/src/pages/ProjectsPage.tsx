import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Plus, Clock, FileCode } from 'lucide-react';
import { getProjects, createProject } from '../api/client';
import type { ProjectData } from '../types';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');

  const fetchProjects = () => {
    getProjects()
      .then(res => setProjects(res.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createProject({ name, description, repository_url: repoUrl });
      setName('');
      setDescription('');
      setRepoUrl('');
      setShowModal(false);
      fetchProjects();
    } catch {}
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Saved Projects</h1>
          <p className="text-sm text-slate-500 mt-1">Organize and track ongoing authorship audits across codebase targets.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary text-xs py-2.5 px-4 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse-gentle">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center max-w-md mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-cream-200 flex items-center justify-center mx-auto text-slate-400">
            <FolderOpen className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-slate-700">No Projects Created Yet</h3>
          <p className="text-xs text-slate-500">Group related files, commits, and audits into structured project workspaces.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary text-xs mx-auto">
            Create First Project
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p, idx) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="card p-5 space-y-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-coral-400/20 to-amber-400/20 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-coral-600" />
                </div>
                {p.overall_prediction && (
                  <span className="badge-mixed text-[11px]">{p.overall_prediction}</span>
                )}
              </div>

              <div>
                <h3 className="font-bold text-slate-800 text-base">{p.name}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description || 'No description provided.'}</p>
              </div>

              {p.repository_url && (
                <p className="text-xs font-mono text-slate-400 truncate">
                  {p.repository_url}
                </p>
              )}

              <div className="pt-2 border-t border-cream-100 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <FileCode className="w-3.5 h-3.5" /> {p.file_count} files
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {p.last_analyzed ? new Date(p.last_analyzed).toLocaleDateString() : 'Pending'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 border border-cream-200"
          >
            <h3 className="text-lg font-bold text-slate-800">Create New Project</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Core Authentication Service"
                  className="w-full text-sm p-2.5 rounded-xl border border-cream-200 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-coral-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of the project codebase..."
                  rows={3}
                  className="w-full text-sm p-2.5 rounded-xl border border-cream-200 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-coral-400 resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Repository URL (Optional)</label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/org/repo"
                  className="w-full text-sm p-2.5 rounded-xl border border-cream-200 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-coral-400"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs py-2 px-4">
                  Save Project
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
