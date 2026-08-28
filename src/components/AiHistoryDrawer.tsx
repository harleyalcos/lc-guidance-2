import React, { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AiSession {
  id: string;
  title: string;
  tag: string; // 'Reports' | 'Queries'
  created_at: string;
  updated_at: string;
}

export interface AiSavedMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  metadata?: string | null;
  timestamp: string;
}

export interface AiGeneratedDocument {
  message_id: string;
  session_id: string;
  session_title: string;
  title: string;
  reporting_period: string;
  scope: string;
  status_filter: string;
  content: string;
  timestamp: string;
}

interface AiHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: AiSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onClearAll: () => void;
}

type MainTab = "chats" | "documents";
type FilterTag = "All" | "Reports" | "Queries";

function getRelativeGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  
  // Strip time for clean day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - itemDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 Days";
  return "Older";
}

function formatSessionDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `${mm}/${dd}/${yyyy} • ${timeStr}`;
  } catch {
    return "";
  }
}

export default function AiHistoryDrawer({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onClearAll,
}: AiHistoryDrawerProps) {
  const [activeTab, setActiveTab] = useState<MainTab>("chats");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<FilterTag>("All");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Documents State
  const [documents, setDocuments] = useState<AiGeneratedDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  // Fetch documents when drawer is open or when switching tabs
  const fetchDocuments = async () => {
    try {
      setIsLoadingDocs(true);
      const docs = await invoke<AiGeneratedDocument[]>("get_ai_generated_documents");
      setDocuments(docs || []);
    } catch (err) {
      console.error("[AiHistoryDrawer Failed to fetch documents]", err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDocuments();
    }
  }, [isOpen, sessions]);

  // Filter sessions by tag and search query
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesTag =
        selectedTag === "All" ? true : s.tag.toLowerCase() === selectedTag.toLowerCase();
      const matchesSearch =
        searchQuery.trim() === ""
          ? true
          : s.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTag && matchesSearch;
    });
  }, [sessions, selectedTag, searchQuery]);

  // Filter documents by search query
  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.session_title.toLowerCase().includes(q) ||
        d.scope.toLowerCase().includes(q) ||
        d.reporting_period.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  // Group filtered sessions chronologically
  const groupedSessions = useMemo(() => {
    const groups: { [key: string]: AiSession[] } = {
      Today: [],
      Yesterday: [],
      "Previous 7 Days": [],
      Older: [],
    };

    for (const session of filteredSessions) {
      const groupKey = getRelativeGroup(session.updated_at);
      if (groups[groupKey]) {
        groups[groupKey].push(session);
      } else {
        groups["Older"].push(session);
      }
    }

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredSessions]);

  // Group filtered documents chronologically
  const groupedDocuments = useMemo(() => {
    const groups: { [key: string]: AiGeneratedDocument[] } = {
      Today: [],
      Yesterday: [],
      "Previous 7 Days": [],
      Older: [],
    };

    for (const doc of filteredDocuments) {
      const groupKey = getRelativeGroup(doc.timestamp);
      if (groups[groupKey]) {
        groups[groupKey].push(doc);
      } else {
        groups["Older"].push(doc);
      }
    }

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredDocuments]);

  // Counts for filter pills
  const reportCount = useMemo(
    () => sessions.filter((s) => s.tag.toLowerCase() === "reports").length,
    [sessions]
  );
  const queryCount = useMemo(
    () => sessions.filter((s) => s.tag.toLowerCase() === "queries").length,
    [sessions]
  );

  const startRenaming = (session: AiSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitleValue(session.title);
  };

  const handleSaveRename = (sessionId: string) => {
    if (editTitleValue.trim()) {
      onRenameSession(sessionId, editTitleValue.trim());
    }
    setEditingSessionId(null);
  };

  const handleKeyDownRename = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === "Enter") {
      handleSaveRename(sessionId);
    } else if (e.key === "Escape") {
      setEditingSessionId(null);
    }
  };

  const confirmDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteSession(sessionId);
    setSessionToDelete(null);
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-Over Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[400px] bg-surface dark:bg-surface-container-lowest border-l border-outline-variant shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Top Bar */}
        <div className="p-3.5 border-b border-outline-variant flex items-center justify-between bg-surface-container-low/60 dark:bg-surface-container-lowest">
          {/* Main Tabs (Chats vs Documents) */}
          <div className="flex items-center gap-1 bg-surface-container p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setActiveTab("chats");
                setSearchQuery("");
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "chats"
                  ? "bg-surface dark:bg-surface-container-high text-on-surface shadow-xs font-bold"
                  : "text-secondary hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">chat</span>
              <span>Chats ({sessions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("documents");
                setSearchQuery("");
                fetchDocuments();
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "documents"
                  ? "bg-surface dark:bg-surface-container-high text-primary shadow-xs font-bold"
                  : "text-secondary hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[15px] text-[#002F87] dark:text-blue-400">
                picture_as_pdf
              </span>
              <span>Documents ({documents.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* New Chat Button */}
            <button
              type="button"
              onClick={() => {
                onNewChat();
                onClose();
              }}
              className="px-2.5 py-1 bg-primary text-on-primary rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
              title="Start a new chat session"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              <span>New</span>
            </button>

            {/* Close Drawer Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-container-high text-secondary hover:text-on-surface transition-colors cursor-pointer"
              title="Close history drawer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Search Bar & Tag Filter Pills */}
        <div className="p-3 border-b border-outline-variant bg-surface space-y-2.5">
          {/* Search Box */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[17px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === "chats"
                  ? "Search previous chats..."
                  : "Search generated documents, scope, period..."
              }
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface-container-low dark:bg-surface-container border border-outline-variant rounded-lg text-on-surface placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {/* Tag Filter Pills (Only on Chats Tab) */}
          {activeTab === "chats" ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTag("All")}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                  selectedTag === "All"
                    ? "bg-primary text-on-primary font-bold shadow-xs"
                    : "bg-surface-container text-secondary hover:text-on-surface"
                }`}
              >
                All ({sessions.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTag("Reports")}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                  selectedTag === "Reports"
                    ? "bg-primary text-on-primary font-bold shadow-xs"
                    : "bg-surface-container text-secondary hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">article</span>
                <span>Reports ({reportCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTag("Queries")}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                  selectedTag === "Queries"
                    ? "bg-primary text-on-primary font-bold shadow-xs"
                    : "bg-surface-container text-secondary hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">chat</span>
                <span>Queries ({queryCount})</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-secondary font-medium px-0.5">
              <span>All AI Generated PDF Reports Archive</span>
              <span className="font-bold text-primary">{filteredDocuments.length} document{filteredDocuments.length === 1 ? "" : "s"}</span>
            </div>
          )}
        </div>

        {/* ─── Main Content Area (Scrollable) ─── */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {activeTab === "chats" ? (
            /* ─── Chats Tab List ─── */
            groupedSessions.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-4">
                <span className="material-symbols-outlined text-[36px] text-gray-300 dark:text-gray-600 mb-2">
                  history_toggle_off
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 m-0">
                  {searchQuery ? "No matching conversations" : "No conversation history yet"}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 max-w-[200px]">
                  {searchQuery
                    ? "Try checking your spelling or selecting another filter tag."
                    : "Ask questions or generate reports to build your record history."}
                </p>
              </div>
            ) : (
              groupedSessions.map(([groupName, groupItems]) => (
                <div key={groupName} className="space-y-1">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-secondary px-2 mb-1">
                    {groupName}
                  </h3>

                  <div className="space-y-1">
                    {groupItems.map((session) => {
                      const isActive = session.id === activeSessionId;
                      const isEditing = editingSessionId === session.id;
                      const isReport = session.tag.toLowerCase() === "reports";

                      return (
                        <div
                          key={session.id}
                          onClick={() => {
                            if (!isEditing) {
                              onSelectSession(session.id);
                              onClose();
                            }
                          }}
                          className={`group relative flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                            isActive
                              ? "bg-primary/5 dark:bg-surface-container-high border-gray-400 dark:border-gray-600 text-on-surface shadow-xs"
                              : "bg-surface hover:bg-surface-container border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-on-surface"
                          }`}
                        >
                          {/* Icon Indicator */}
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                              isReport
                                ? "bg-blue-50 dark:bg-blue-950/50 text-[#002F87] dark:text-blue-300"
                                : "bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {isReport ? "article" : "chat_bubble"}
                            </span>
                          </div>

                          {/* Title & Metadata */}
                          <div className="flex-1 min-w-0 pr-8">
                            {isEditing ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editTitleValue}
                                  onChange={(e) => setEditTitleValue(e.target.value)}
                                  onKeyDown={(e) => handleKeyDownRename(e, session.id)}
                                  onBlur={() => handleSaveRename(session.id)}
                                  autoFocus
                                  className="w-full text-xs font-semibold px-2 py-1 bg-surface border border-primary rounded focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(session.id)}
                                  className="p-1 text-primary hover:bg-primary/10 rounded cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[15px]">check</span>
                                </button>
                              </div>
                            ) : (
                              <>
                                <h4 className="text-xs font-semibold truncate m-0 text-on-surface">
                                  {session.title}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-secondary font-data-mono">
                                  <span>{formatSessionDateTime(session.updated_at)}</span>
                                  <span>•</span>
                                  <span
                                    className={`text-[9.5px] uppercase font-bold tracking-wider px-1 rounded ${
                                      isReport
                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                        : "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                    }`}
                                  >
                                    {session.tag}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Hover Action Buttons */}
                          {!isEditing && (
                            <div className="absolute right-2 top-2.5 hidden group-hover:flex items-center gap-0.5 bg-surface/90 dark:bg-surface-container-high/90 p-0.5 rounded-lg border border-outline-variant shadow-xs">
                              <button
                                type="button"
                                onClick={(e) => startRenaming(session, e)}
                                className="p-1 text-secondary hover:text-primary rounded hover:bg-surface-container-low transition-colors cursor-pointer"
                                title="Rename session"
                              >
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSessionToDelete(session.id);
                                }}
                                className="p-1 text-secondary hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                                title="Delete session"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                              </button>
                            </div>
                          )}

                          {/* Confirmation dialog for deleting this session */}
                          {sessionToDelete === session.id && (
                            <div
                              className="absolute inset-0 bg-surface dark:bg-surface-container border border-red-200 dark:border-red-900 rounded-xl p-2 flex items-center justify-between z-10 shadow-md"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
                                Delete this chat?
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => confirmDelete(session.id, e)}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSessionToDelete(null);
                                  }}
                                  className="px-2 py-0.5 text-[10px] font-medium bg-surface-container hover:bg-surface-container-high text-on-surface rounded cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )
          ) : (
            /* ─── Documents Tab List (PDF Documents Archive) ─── */
            isLoadingDocs ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-4">
                <span className="material-symbols-outlined text-[32px] text-primary animate-spin mb-2">
                  progress_activity
                </span>
                <p className="text-xs font-semibold text-secondary m-0">Loading generated reports...</p>
              </div>
            ) : groupedDocuments.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-4">
                <span className="material-symbols-outlined text-[36px] text-gray-300 dark:text-gray-600 mb-2">
                  description
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 m-0">
                  {searchQuery ? "No matching documents" : "No PDF reports generated yet"}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 max-w-[220px]">
                  Ask the Guidance AI to generate any monthly, annual, or offense summary report.
                </p>
              </div>
            ) : (
              groupedDocuments.map(([groupName, groupItems]) => (
                <div key={groupName} className="space-y-1.5">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-secondary px-2 mb-1">
                    {groupName}
                  </h3>

                  <div className="space-y-2">
                    {groupItems.map((doc) => (
                      <div
                        key={doc.message_id}
                        onClick={() => {
                          onSelectSession(doc.session_id);
                          onClose();
                        }}
                        className="group relative flex flex-col gap-1.5 p-3 rounded-xl bg-surface hover:bg-surface-container border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-all cursor-pointer shadow-xs text-left"
                      >
                        {/* Header: Icon + Title */}
                        <div className="flex items-start gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#002F87] dark:text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-gray-900 dark:text-on-surface group-hover:text-primary transition-colors line-clamp-2 m-0 leading-tight">
                              {doc.title}
                            </h4>
                            <p className="text-[10.5px] text-gray-500 dark:text-secondary mt-0.5 m-0 truncate">
                              From: {doc.session_title}
                            </p>
                          </div>
                        </div>

                        {/* Metadata Pills */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-outline-variant/40 text-[10.5px]">
                          {doc.reporting_period && doc.reporting_period !== "—" && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-[#002F87] dark:text-blue-300 font-medium font-data-mono">
                              Period: {doc.reporting_period}
                            </span>
                          )}
                          {doc.scope && doc.scope !== "—" && (
                            <span className="px-1.5 py-0.5 rounded bg-surface-container text-secondary font-medium truncate max-w-[150px]">
                              {doc.scope}
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-secondary font-data-mono">
                            {formatSessionDateTime(doc.timestamp)}
                          </span>
                        </div>

                        {/* Action Hint on Hover */}
                        <div className="hidden group-hover:flex items-center justify-end gap-1 pt-1 text-[11px] font-bold text-primary">
                          <span>View in Chat</span>
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Drawer Footer with Clear All */}
        {sessions.length > 0 && activeTab === "chats" && (
          <div className="p-3 border-t border-outline-variant bg-surface-container-low/40 dark:bg-surface-container-lowest flex justify-between items-center text-xs">
            <span className="text-[11px] text-secondary">
              {sessions.length} saved session{sessions.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-900/50 flex items-center gap-1.5 cursor-pointer transition-all"
              title="Clear all saved history"
            >
              <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
              <span>Clear History</span>
            </button>
          </div>
        )}
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-surface dark:bg-surface-container border border-outline-variant rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/60 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">delete_forever</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0">Clear All History?</h3>
                <p className="text-[11px] text-secondary m-0 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-secondary leading-relaxed m-0">
              Are you sure you want to permanently delete all {sessions.length} conversation{sessions.length === 1 ? "" : "s"} and generated documents?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setShowClearModal(false);
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
