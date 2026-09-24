'use client';

import { useMemo, useState } from 'react';
import type {
  ManagementResourceInventoryData,
  ManagementResourceKnowledgeStatus,
  ManagementRoomOperationalStatus,
  ManagementTeacherOperationalStatus,
  ManagementRoomProfilePreview,
  ManagementRoomResourceRow,
  ManagementRoomStatusPreview,
  ManagementTeacherResourceRow,
} from '@/lib/managementResources';

type ResourceTab = 'TEACHERS' | 'ROOMS';

function capabilityLabel(value: string) {
  const labels: Record<string, string> = {
    GENERAL_CLASSROOM_SMALL_GROUP: 'Genel Derslik (Küçük Grup)',
    GENERAL_CLASSROOM_LARGE_GROUP: 'Genel Derslik (Büyük Grup)',
    STUDIO_SMALL_GROUP: 'Stüdyo (Küçük Grup)',
    STUDIO_LARGE_GROUP: 'Stüdyo (Büyük Grup)',
    INSTRUMENT_RELATED_CLASSROOM: 'Enstrüman ilişkili derslik',
  };

  return labels[value] ?? value;
}


function isRetiredSpecialTeacherPlaceholder(
  row: ManagementTeacherResourceRow,
) {
  if (row.activeRequirementCount > 0 || row.placedBlockCount > 0) {
    return false;
  }

  const names = [row.name, row.baseName]
    .map((value) => value.trim().toLocaleLowerCase('tr-TR'));

  return names.some((name) => (
    (
      name.startsWith('orkestra')
      || name.startsWith('doğaçlama')
    )
    && (
      /öğretmeni[\s._-]*\d+$/.test(name)
      || /ö\.?[\s._-]*\d+$/.test(name)
    )
  ));
}

function teacherState(row: ManagementTeacherResourceRow) {
  if (row.operationalStatus === 'INACTIVE') {
    return {
      label: 'Pasif',
      className: 'bg-slate-200 text-slate-600',
    };
  }

  if (row.activeRequirementCount === 0 && row.placedBlockCount === 0) {
    return {
      label: 'Kullanım yok',
      className: 'bg-slate-100 text-slate-500',
    };
  }

  if (row.activeRequirementCount === 0 && row.placedBlockCount > 0) {
    return {
      label: 'Atama kontrolü',
      className: 'bg-amber-50 text-amber-700',
    };
  }

  return {
    label: 'Aktif',
    className: 'bg-emerald-50 text-emerald-700',
  };
}

function roomType(row: ManagementRoomResourceRow) {
  if (row.canonicalRoomId) return 'Takma ad';
  if (row.aliasCount > 0) return 'Ana kayıt';
  return 'Salon';
}

function roomStatusMeta(status: ManagementRoomOperationalStatus) {
  if (status === 'MAINTENANCE') {
    return {
      label: 'Tadilatta',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  }

  if (status === 'OUT_OF_SERVICE') {
    return {
      label: 'Kullanım dışı',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  return {
    label: 'Aktif',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
}

export function ManagementResources({
  data,
  canEdit,
  onUpdateTeacherName,
  onUpdateRoomName,
  onCreateTeacher,
  onCreateRoom,
  onSetTeacherStatus,
  onDeleteTeacher,
  onDeleteRoom,
  onPreviewRoomProfile,
  onApplyRoomProfile,
  onPreviewRoomStatus,
  onApplyRoomStatus,
}: {
  data: ManagementResourceInventoryData | null;
  canEdit: boolean;
  onUpdateTeacherName: (teacherId: string, displayName: string) => Promise<void>;
  onUpdateRoomName: (roomId: string, displayName: string) => Promise<void>;
  onCreateTeacher: (name: string) => Promise<void>;
  onCreateRoom: (name: string) => Promise<void>;
  onSetTeacherStatus: (
    teacherId: string,
    status: ManagementTeacherOperationalStatus,
  ) => Promise<void>;
  onDeleteTeacher: (teacherId: string) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onPreviewRoomProfile: (
    roomId: string,
    capabilities: string[],
    knowledgeStatus: ManagementResourceKnowledgeStatus,
  ) => Promise<ManagementRoomProfilePreview>;
  onApplyRoomProfile: (
    roomId: string,
    capabilities: string[],
    knowledgeStatus: ManagementResourceKnowledgeStatus,
    expectedStateToken: string,
  ) => Promise<void>;
  onPreviewRoomStatus: (
    roomId: string,
    operationalStatus: ManagementRoomOperationalStatus,
  ) => Promise<ManagementRoomStatusPreview>;
  onApplyRoomStatus: (
    roomId: string,
    operationalStatus: ManagementRoomOperationalStatus,
    expectedStateToken: string,
  ) => Promise<void>;
}) {
  const [tab, setTab] = useState<ResourceTab>('TEACHERS');
  const [query, setQuery] = useState('');
  const [showInactiveTeachers, setShowInactiveTeachers] = useState(false);
  const [createKind, setCreateKind] = useState<'TEACHER' | 'ROOM' | null>(null);
  const [createName, setCreateName] = useState('');
  const [resourceActionError, setResourceActionError] = useState<string | null>(null);
  const [resourceActionBusy, setResourceActionBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    kind: 'TEACHER' | 'ROOM';
    id: string;
    currentName: string;
    baseName: string;
    nameOverridden: boolean;
  } | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [profileTarget, setProfileTarget] = useState<ManagementRoomResourceRow | null>(null);
  const [profileCapabilities, setProfileCapabilities] = useState<string[]>([]);
  const [profilePreview, setProfilePreview] =
    useState<ManagementRoomProfilePreview | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profilePreviewing, setProfilePreviewing] = useState(false);
  const [profileApplying, setProfileApplying] = useState(false);
  const [profileWizardActive, setProfileWizardActive] = useState(false);
  const [profileWizardTotal, setProfileWizardTotal] = useState(0);
  const [profileWizardCompletedIds, setProfileWizardCompletedIds] =
    useState<string[]>([]);
  const [profileWizardSkippedIds, setProfileWizardSkippedIds] =
    useState<string[]>([]);

  const [statusTarget, setStatusTarget] =
    useState<ManagementRoomResourceRow | null>(null);
  const [statusSelection, setStatusSelection] =
    useState<ManagementRoomOperationalStatus>('ACTIVE');
  const [statusPreview, setStatusPreview] =
    useState<ManagementRoomStatusPreview | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusPreviewing, setStatusPreviewing] = useState(false);
  const [statusApplying, setStatusApplying] = useState(false);

  const openEditor = (
    kind: 'TEACHER' | 'ROOM',
    row: ManagementTeacherResourceRow | ManagementRoomResourceRow,
  ) => {
    setEditTarget({
      kind,
      id: row.id,
      currentName: row.name,
      baseName: row.baseName,
      nameOverridden: row.nameOverridden,
    });
    setEditName(row.name);
    setEditError(null);
  };

  const saveName = async (name: string) => {
    if (!editTarget || saving) return;

    const nextName = name.trim();
    if (!nextName) {
      setEditError('Kaynak adı boş bırakılamaz.');
      return;
    }

    setSaving(true);
    setEditError(null);

    try {
      if (editTarget.kind === 'TEACHER') {
        await onUpdateTeacherName(editTarget.id, nextName);
      } else {
        await onUpdateRoomName(editTarget.id, nextName);
      }
      setEditTarget(null);
    } catch (reason: unknown) {
      setEditError(
        reason instanceof Error
          ? reason.message
          : 'Kaynak adı güncellenemedi.',
      );
    } finally {
      setSaving(false);
    }
  };

  const createResource = async () => {
    if (!createKind || resourceActionBusy) return;
    const name = createName.trim();
    if (!name) {
      setResourceActionError('Kaynak adı boş bırakılamaz.');
      return;
    }

    setResourceActionBusy(true);
    setResourceActionError(null);
    try {
      if (createKind === 'TEACHER') {
        await onCreateTeacher(name);
      } else {
        await onCreateRoom(name);
      }
      setCreateKind(null);
      setCreateName('');
    } catch (reason: unknown) {
      setResourceActionError(
        reason instanceof Error ? reason.message : 'Kaynak oluşturulamadı.',
      );
    } finally {
      setResourceActionBusy(false);
    }
  };

  const changeTeacherStatus = async (
    row: ManagementTeacherResourceRow,
    status: ManagementTeacherOperationalStatus,
  ) => {
    if (resourceActionBusy) return;
    setResourceActionBusy(true);
    setResourceActionError(null);
    try {
      await onSetTeacherStatus(row.id, status);
    } catch (reason: unknown) {
      setResourceActionError(
        reason instanceof Error ? reason.message : 'Öğretmen durumu değiştirilemedi.',
      );
    } finally {
      setResourceActionBusy(false);
    }
  };

  const deleteTeacher = async (row: ManagementTeacherResourceRow) => {
    if (resourceActionBusy) return;
    setResourceActionBusy(true);
    setResourceActionError(null);
    try {
      await onDeleteTeacher(row.id);
    } catch (reason: unknown) {
      setResourceActionError(
        reason instanceof Error ? reason.message : 'Öğretmen silinemedi.',
      );
    } finally {
      setResourceActionBusy(false);
    }
  };

  const deleteRoom = async (row: ManagementRoomResourceRow) => {
    if (resourceActionBusy) return;
    setResourceActionBusy(true);
    setResourceActionError(null);
    try {
      await onDeleteRoom(row.id);
    } catch (reason: unknown) {
      setResourceActionError(
        reason instanceof Error ? reason.message : 'Salon silinemedi.',
      );
    } finally {
      setResourceActionBusy(false);
    }
  };

  const loadProfileTarget = (row: ManagementRoomResourceRow) => {
    setProfileTarget(row);
    setProfileCapabilities(
      [...row.capabilities].sort((a, b) => a.localeCompare(b, 'en')),
    );
    setProfilePreview(null);
    setProfileError(null);
  };

  const closeProfileEditor = () => {
    setProfileTarget(null);
    setProfilePreview(null);
    setProfileError(null);
    setProfileWizardActive(false);
    setProfileWizardTotal(0);
    setProfileWizardCompletedIds([]);
    setProfileWizardSkippedIds([]);
  };

  const openProfileEditor = (row: ManagementRoomResourceRow) => {
    setProfileWizardActive(false);
    setProfileWizardTotal(0);
    setProfileWizardCompletedIds([]);
    setProfileWizardSkippedIds([]);
    loadProfileTarget(row);
  };

  const wizardCandidates = (
    completedIds: string[],
    skippedIds: string[],
    excludeId?: string,
  ) => (
    data?.rooms
      .filter((row) => (
        !row.canonicalRoomId
        && row.capabilities.length === 0
        && row.id !== excludeId
        && !completedIds.includes(row.id)
        && !skippedIds.includes(row.id)
      ))
      .sort((a, b) => a.name.localeCompare(
        b.name,
        'tr',
        { numeric: true },
      )) ?? []
  );

  const openProfileWizard = () => {
    const candidates = wizardCandidates([], []);

    if (candidates.length === 0) return;

    setProfileWizardActive(true);
    setProfileWizardTotal(candidates.length);
    setProfileWizardCompletedIds([]);
    setProfileWizardSkippedIds([]);
    loadProfileTarget(candidates[0]);
  };

  const advanceProfileWizard = (
    completedIds: string[],
    skippedIds: string[],
    excludeId?: string,
  ) => {
    const next = wizardCandidates(
      completedIds,
      skippedIds,
      excludeId,
    )[0];

    if (!next) {
      closeProfileEditor();
      return;
    }

    loadProfileTarget(next);
  };

  const skipProfileWizardRoom = () => {
    if (!profileTarget || !profileWizardActive) return;

    const skipped = [
      ...profileWizardSkippedIds,
      profileTarget.id,
    ];

    setProfileWizardSkippedIds(skipped);
    advanceProfileWizard(
      profileWizardCompletedIds,
      skipped,
      profileTarget.id,
    );
  };

  const toggleCapability = (capability: string) => {
    setProfileCapabilities((current) => (
      current.includes(capability)
        ? current.filter((value) => value !== capability)
        : [...current, capability].sort((a, b) => a.localeCompare(b, 'en'))
    ));
    setProfilePreview(null);
    setProfileError(null);
  };

  const previewProfile = async () => {
    if (!profileTarget || profilePreviewing || profileApplying) return;

    setProfilePreviewing(true);
    setProfileError(null);
    setProfilePreview(null);

    try {
      setProfilePreview(await onPreviewRoomProfile(
        profileTarget.id,
        profileCapabilities,
        'CONFIRMED',
      ));
    } catch (reason: unknown) {
      setProfileError(
        reason instanceof Error
          ? reason.message
          : 'Salon değişikliğinin etkisi hesaplanamadı.',
      );
    } finally {
      setProfilePreviewing(false);
    }
  };

  const applyProfile = async () => {
    if (
      !profileTarget
      || !profilePreview
      || !profilePreview.canApply
      || profileApplying
      || profilePreviewing
    ) {
      return;
    }

    setProfileApplying(true);
    setProfileError(null);

    try {
      await onApplyRoomProfile(
        profileTarget.id,
        profileCapabilities,
        'CONFIRMED',
        profilePreview.stateToken,
      );

      if (profileWizardActive) {
        const completed = [
          ...profileWizardCompletedIds,
          profileTarget.id,
        ];

        setProfileWizardCompletedIds(completed);
        advanceProfileWizard(
          completed,
          profileWizardSkippedIds,
          profileTarget.id,
        );
      } else {
        setProfileTarget(null);
        setProfilePreview(null);
      }
    } catch (reason: unknown) {
      setProfileError(
        reason instanceof Error
          ? reason.message
          : 'Salon özellikleri güncellenemedi.',
      );
    } finally {
      setProfileApplying(false);
    }
  };

  const openStatusEditor = (row: ManagementRoomResourceRow) => {
    setStatusTarget(row);
    setStatusSelection(row.operationalStatus);
    setStatusPreview(null);
    setStatusError(null);
  };

  const previewStatus = async () => {
    if (!statusTarget || statusPreviewing || statusApplying) return;

    setStatusPreviewing(true);
    setStatusError(null);
    setStatusPreview(null);

    try {
      setStatusPreview(await onPreviewRoomStatus(
        statusTarget.id,
        statusSelection,
      ));
    } catch (reason: unknown) {
      setStatusError(
        reason instanceof Error
          ? reason.message
          : 'Salon durumu değişikliğinin etkisi hesaplanamadı.',
      );
    } finally {
      setStatusPreviewing(false);
    }
  };

  const applyStatus = async () => {
    if (
      !statusTarget
      || !statusPreview
      || !statusPreview.canApply
      || statusPreviewing
      || statusApplying
    ) {
      return;
    }

    setStatusApplying(true);
    setStatusError(null);

    try {
      await onApplyRoomStatus(
        statusTarget.id,
        statusSelection,
        statusPreview.stateToken,
      );
      setStatusTarget(null);
      setStatusPreview(null);
    } catch (reason: unknown) {
      setStatusError(
        reason instanceof Error
          ? reason.message
          : 'Salon durumu güncellenemedi.',
      );
    } finally {
      setStatusApplying(false);
    }
  };

  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');

  const visibleTeachers = useMemo(
    () => (
      data?.teachers.filter(
        (row) => (
          !isRetiredSpecialTeacherPlaceholder(row)
          && (showInactiveTeachers || row.operationalStatus === 'ACTIVE')
        ),
      ) ?? []
    ),
    [data?.teachers, showInactiveTeachers],
  );

  const filteredTeachers = useMemo(
    () => (
      visibleTeachers.filter((row) => (
        normalizedQuery.length === 0
        || row.name.toLocaleLowerCase('tr-TR').includes(normalizedQuery)
        || row.baseName.toLocaleLowerCase('tr-TR').includes(normalizedQuery)
      ))
    ),
    [normalizedQuery, visibleTeachers],
  );

  const filteredRooms = useMemo(
    () => {
      if (!data) return [];

      const aliasesByCanonical = new Map<string, string[]>();
      data.rooms.forEach((room) => {
        if (!room.canonicalRoomId) return;
        const aliases = aliasesByCanonical.get(room.canonicalRoomId) ?? [];
        aliases.push(room.name);
        aliasesByCanonical.set(room.canonicalRoomId, aliases);
      });

      return data.rooms
        .filter((row) => !row.canonicalRoomId)
        .filter((row) => {
          if (normalizedQuery.length === 0) return true;

          const status = roomStatusMeta(row.operationalStatus).label;
          const haystack = [
            row.name,
            row.baseName,
            status,
            ...(aliasesByCanonical.get(row.id) ?? []),
            ...row.capabilities.map(capabilityLabel),
          ]
            .join(' ')
            .toLocaleLowerCase('tr-TR');

          return haystack.includes(normalizedQuery);
        })
        .sort((a, b) => a.name.localeCompare(
          b.name,
          'tr',
          { numeric: true },
        ));
    },
    [data, normalizedQuery],
  );

  if (!data) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-400 shadow-sm">
          Kaynak envanteri hazırlanıyor…
        </div>
      </section>
    );
  }

  const assignedTeacherCount = visibleTeachers.filter(
    (row) => row.activeRequirementCount > 0,
  ).length;

  const usedTeacherCount = visibleTeachers.filter(
    (row) => row.placedBlockCount > 0,
  ).length;

  const canonicalRooms = data.rooms.filter(
    (row) => !row.canonicalRoomId,
  );

  const profiledRoomCount = canonicalRooms.filter(
    (row) => row.capabilities.length > 0,
  ).length;

  const missingRoomProfileCount =
    canonicalRooms.length - profiledRoomCount;

  const activeRoomCount = canonicalRooms.filter(
    (row) => row.operationalStatus === 'ACTIVE',
  ).length;

  const maintenanceRoomCount = canonicalRooms.filter(
    (row) => row.operationalStatus === 'MAINTENANCE',
  ).length;

  const outOfServiceRoomCount = canonicalRooms.filter(
    (row) => row.operationalStatus === 'OUT_OF_SERVICE',
  ).length;

  return (
    <section className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-[1180px] space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Kaynaklar
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                Öğretmen ve salon envanteri
              </h2>
              <p className="mt-2 max-w-[720px] text-sm font-medium leading-6 text-slate-500">
                Ders Planı ve Program tarafından kullanılan öğretmen ve salon kayıtlarını,
                mevcut atamaları ve programdaki fiilî kullanımı tek yerde gösterir.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                M18.7
              </p>
              <p className="mt-1 text-[11px] font-bold text-slate-700">
                Salon profili sihirbazı
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('TEACHERS')}
              className={`rounded-lg px-4 py-2 text-[10px] font-black transition ${
                tab === 'TEACHERS'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Öğretmenler · {visibleTeachers.length}
            </button>
            <button
              type="button"
              onClick={() => setTab('ROOMS')}
              className={`rounded-lg px-4 py-2 text-[10px] font-black transition ${
                tab === 'ROOMS'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Salonlar · {canonicalRooms.length}
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {tab === 'TEACHERS' && (
              <button
                type="button"
                onClick={() => setShowInactiveTeachers((value) => !value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
              >
                {showInactiveTeachers ? 'Pasifleri gizle' : 'Pasifleri göster'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCreateKind(tab === 'TEACHERS' ? 'TEACHER' : 'ROOM');
                setCreateName('');
                setResourceActionError(null);
              }}
              disabled={!canEdit}
              className="rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-black text-white hover:bg-slate-800 disabled:opacity-35"
            >
              + {tab === 'TEACHERS' ? 'Öğretmen' : 'Salon'}
            </button>
          </div>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === 'TEACHERS'
              ? 'Öğretmen ara…'
              : 'Salon veya özellik ara…'}
            className="w-[300px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
          />
        </div>

        {tab === 'TEACHERS' ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Öğretmen kaydı
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {visibleTeachers.length}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Aktif derse atanmış
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {assignedTeacherCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Programda kullanılan
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {usedTeacherCount}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(240px,1fr)_105px_120px_105px_190px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                <span>Öğretmen</span>
                <span className="text-right">Aktif ders</span>
                <span className="text-right">Programdaki blok</span>
                <span className="text-right">Durum</span>
                <span className="text-right">İşlem</span>
              </div>

              {filteredTeachers.length > 0 ? (
                filteredTeachers.map((row) => {
                  const state = teacherState(row);

                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[minmax(240px,1fr)_105px_120px_105px_190px] items-center border-b border-slate-100 px-4 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-slate-900">
                          {row.name}
                        </p>
                        {row.nameOverridden ? (
                          <p className="mt-0.5 truncate text-[9px] font-semibold text-blue-600">
                            Taslak ad · Yayınlanan: {row.baseName}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                            Öğretmen kaydı
                          </p>
                        )}
                      </div>

                      <p className="text-right text-[11px] font-black text-slate-700">
                        {row.activeRequirementCount}
                      </p>

                      <p className="text-right text-[11px] font-black text-slate-700">
                        {row.placedBlockCount}
                      </p>

                      <div className="text-right">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black ${state.className}`}>
                          {state.label}
                        </span>
                      </div>

                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditor('TEACHER', row)}
                          disabled={!canEdit || resourceActionBusy}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-35"
                        >
                          Ad
                        </button>
                        <button
                          type="button"
                          onClick={() => void changeTeacherStatus(
                            row,
                            row.operationalStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                          )}
                          disabled={!canEdit || resourceActionBusy || (
                            row.operationalStatus === 'ACTIVE'
                            && row.placedBlockCount > 0
                          )}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-35"
                        >
                          {row.operationalStatus === 'ACTIVE' ? 'Pasif' : 'Aktif'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTeacher(row)}
                          disabled={
                            !canEdit
                            || resourceActionBusy
                            || row.activeRequirementCount > 0
                            || row.placedBlockCount > 0
                          }
                          className="rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-[9px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-sm font-semibold text-slate-400">
                  Aramanızla eşleşen öğretmen bulunamadı.
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Ana salon
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {canonicalRooms.length}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-emerald-700">
                  Aktif
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-900">
                  {activeRoomCount}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-amber-700">
                  Tadilatta
                </p>
                <p className="mt-2 text-2xl font-black text-amber-900">
                  {maintenanceRoomCount}
                </p>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-rose-700">
                  Kullanım dışı
                </p>
                <p className="mt-2 text-2xl font-black text-rose-900">
                  {outOfServiceRoomCount}
                </p>
              </div>
            </div>

            {missingRoomProfileCount > 0 && (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold text-amber-900">
                    {missingRoomProfileCount} salonun kullanım özellikleri henüz tanımlanmadı.
                  </p>
                  <p className="mt-1 text-[9px] font-medium text-amber-700">
                    Sihirbaz eksik salonları sırayla açar; bilmediğiniz salonu şimdilik atlayabilirsiniz.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openProfileWizard}
                  disabled={!canEdit}
                  className="shrink-0 rounded-xl bg-amber-900 px-4 py-2.5 text-[10px] font-black text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Profilleri tamamla
                </button>
              </div>
            )}

            <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(170px,0.8fr)_90px_125px_minmax(250px,1.35fr)_82px_92px_195px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                <span>Salon</span>
                <span>Tür</span>
                <span>Durum</span>
                <span>Özellikler</span>
                <span className="text-right">Aktif ders</span>
                <span className="text-right">Program</span>
                <span className="text-right">İşlem</span>
              </div>

              {filteredRooms.length > 0 ? (
                filteredRooms.map((row) => {
                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[minmax(170px,0.8fr)_90px_125px_minmax(250px,1.35fr)_82px_92px_195px] items-center gap-0 border-b border-slate-100 px-4 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-slate-900">
                          {row.name}
                        </p>
                        {row.canonicalRoomName && (
                          <p className="mt-0.5 truncate text-[9px] font-medium text-slate-400">
                            → {row.canonicalRoomName}
                          </p>
                        )}
                        {row.nameOverridden && (
                          <p className="mt-0.5 truncate text-[9px] font-semibold text-blue-600">
                            Taslak ad · Yayınlanan: {row.baseName}
                          </p>
                        )}
                        {!row.canonicalRoomId && row.aliasCount > 0 && (
                          <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                            {row.aliasCount} takma ad bağlı
                          </p>
                        )}
                      </div>

                      <p className="text-[10px] font-bold text-slate-600">
                        {roomType(row)}
                      </p>

                      <div>
                        <button
                          type="button"
                          onClick={() => openStatusEditor(row)}
                          disabled={!canEdit}
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 ${
                            roomStatusMeta(row.operationalStatus).className
                          }`}
                        >
                          {roomStatusMeta(row.operationalStatus).label}
                        </button>
                      </div>

                      <div className="flex min-w-0 flex-wrap gap-1">
                        {row.capabilities.length > 0 ? (
                          row.capabilities.slice(0, 4).map((capability) => (
                            <span
                              key={capability}
                              className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-600"
                            >
                              {capabilityLabel(capability)}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[8px] font-black text-amber-700">
                            Profil tamamlanmalı
                          </span>
                        )}
                        {row.capabilities.length > 4 && (
                          <span className="rounded-full bg-slate-50 px-2 py-1 text-[8px] font-bold text-slate-400">
                            +{row.capabilities.length - 4}
                          </span>
                        )}
                      </div>

                      <p className="text-right text-[11px] font-black text-slate-700">
                        {row.activeRequirementCount}
                      </p>

                      <p className="text-right text-[11px] font-black text-slate-700">
                        {row.placedBlockCount}
                      </p>

                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditor('ROOM', row)}
                          disabled={!canEdit}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          Ad
                        </button>
                        <button
                          type="button"
                          onClick={() => openProfileEditor(row)}
                          disabled={!canEdit}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          {row.capabilities.length === 0 ? 'Tanımla' : 'Düzenle'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteRoom(row)}
                          disabled={
                            !canEdit
                            || resourceActionBusy
                            || row.activeRequirementCount > 0
                            || row.placedBlockCount > 0
                            || row.aliasCount > 0
                          }
                          className="rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-[9px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-sm font-semibold text-slate-400">
                  Aramanızla eşleşen ana salon kaydı bulunamadı.
                </div>
              )}
            </div>
          </>
        )}

        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
            Taslak adlar yayınlanan programı değiştirmez
          </p>
          <p className="mt-1 text-[10px] font-medium leading-5 text-blue-800">
            Salon özelliği değişiklikleri etki önizlemesinden geçer. Tadilatta veya kullanım dışı
            salonlar yeni program adaylarından çıkarılır; salonda mevcut yerleşim varsa durum
            değişikliği önce bu derslerin Program ekranında taşınmasını veya kaldırılmasını ister.
          </p>
        </div>
      </div>

      {resourceActionError && (
        <div className="fixed bottom-4 right-4 z-[118] max-w-[430px] rounded-2xl border border-rose-200 bg-white px-4 py-3 text-[10px] font-bold text-rose-700 shadow-xl">
          {resourceActionError}
        </div>
      )}

      {createKind && (
        <div className="fixed inset-0 z-[116] flex items-center justify-center bg-slate-950/30 p-4">
          <div className="w-full max-w-[460px] rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.25)]">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
              Yeni kaynak
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-950">
              {createKind === 'TEACHER' ? 'Öğretmen ekle' : 'Salon ekle'}
            </h3>
            <input
              autoFocus
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createResource();
              }}
              placeholder={createKind === 'TEACHER' ? 'Öğretmen adı' : 'Salon adı'}
              className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-slate-400 focus:bg-white"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateKind(null)}
                disabled={resourceActionBusy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void createResource()}
                disabled={resourceActionBusy || !createName.trim()}
                className="rounded-xl bg-slate-950 px-4 py-2 text-[10px] font-black text-white disabled:opacity-35"
              >
                {resourceActionBusy ? 'Ekleniyor…' : 'Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {statusTarget && (
        <div className="fixed inset-0 z-[114] flex items-center justify-center bg-slate-950/30 p-4">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[620px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.25)]">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Salon durumu
                </p>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  {statusTarget.name}
                </h3>
                <p className="mt-1 text-[10px] font-medium text-slate-500">
                  Aktif olmayan salonlar Program’ın uygun yer hesabından çıkarılır.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusTarget(null)}
                disabled={statusPreviewing || statusApplying}
                className="rounded-lg px-2 py-1 text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <div className="management-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-3 gap-2">
                {([
                  {
                    id: 'ACTIVE',
                    label: 'Aktif',
                    detail: 'Programda kullanılabilir.',
                  },
                  {
                    id: 'MAINTENANCE',
                    label: 'Tadilatta',
                    detail: 'Geçici olarak kullanılamaz.',
                  },
                  {
                    id: 'OUT_OF_SERVICE',
                    label: 'Kullanım dışı',
                    detail: 'Programda kullanılmaz.',
                  },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setStatusSelection(item.id);
                      setStatusPreview(null);
                      setStatusError(null);
                    }}
                    disabled={statusPreviewing || statusApplying}
                    className={`rounded-2xl border p-3 text-left transition ${
                      statusSelection === item.id
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-[10px] font-black">
                      {item.label}
                    </span>
                    <span className={`mt-1 block text-[9px] font-medium leading-4 ${
                      statusSelection === item.id
                        ? 'text-slate-300'
                        : 'text-slate-400'
                    }`}>
                      {item.detail}
                    </span>
                  </button>
                ))}
              </div>

              {statusError && (
                <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-700">
                  {statusError}
                </p>
              )}

              {statusPreview && (
                <div className="mt-4 space-y-3">
                  <div className={`rounded-2xl border p-4 ${
                    statusPreview.canApply
                      ? 'border-emerald-200 bg-emerald-50'
                      : statusPreview.hasChanges
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-slate-200 bg-slate-50'
                  }`}>
                    <p className={`text-[10px] font-black ${
                      statusPreview.canApply
                        ? 'text-emerald-800'
                        : statusPreview.hasChanges
                          ? 'text-amber-800'
                          : 'text-slate-700'
                    }`}>
                      {statusPreview.canApply
                        ? 'Bu durum değişikliği uygulanabilir.'
                        : statusPreview.hasChanges
                          ? 'Önce mevcut program yerleşimleri çözülmeli.'
                          : 'Durum değişikliği yok.'}
                    </p>
                    <p className="mt-1 text-[10px] font-medium leading-5 text-slate-600">
                      {statusPreview.affectedRequirementCount} ders tanımı · {statusPreview.candidateRebuildCardCount} ders bloğunun uygun yerleri yeniden değerlendirilecek.
                    </p>
                  </div>

                  {statusPreview.placedImpacts.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-[10px] font-black text-amber-900">
                        Bu salon şu anda programda kullanılıyor
                      </p>
                      <div className="mt-3 space-y-2">
                        {statusPreview.placedImpacts.map((impact) => (
                          <div
                            key={impact.cardId}
                            className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2"
                          >
                            <p className="text-[10px] font-bold text-slate-800">
                              {impact.subjectName} · {impact.groupName}
                            </p>
                            <p className="mt-0.5 text-[9px] font-medium text-slate-500">
                              Gün {impact.dayOfWeek}, {impact.startPeriod}. ders
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4">
              <p className="text-[9px] font-medium text-slate-400">
                Önizleme hiçbir değişiklik yapmaz.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStatusTarget(null)}
                  disabled={statusPreviewing || statusApplying}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Kapat
                </button>
                <button
                  type="button"
                  onClick={() => void previewStatus()}
                  disabled={statusPreviewing || statusApplying}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-35"
                >
                  {statusPreviewing
                    ? 'Etki hesaplanıyor…'
                    : statusPreview
                      ? 'Etkiyi yeniden hesapla'
                      : 'Etkiyi hesapla'}
                </button>
                {statusPreview?.canApply && (
                  <button
                    type="button"
                    onClick={() => void applyStatus()}
                    disabled={statusPreviewing || statusApplying}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-[10px] font-black text-white hover:bg-slate-800 disabled:opacity-35"
                  >
                    {statusApplying ? 'Uygulanıyor…' : 'Durumu uygula'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {profileTarget && (
        <div className="fixed inset-0 z-[112] flex items-center justify-center bg-slate-950/30 p-4">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[760px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.25)]">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Salon özellikleri
                  </p>
                  {profileWizardActive && (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-600">
                      {Math.min(
                        profileWizardCompletedIds.length
                        + profileWizardSkippedIds.length
                        + 1,
                        profileWizardTotal,
                      )} / {profileWizardTotal}
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  {profileTarget.name}
                </h3>
                <p className="mt-1 text-[10px] font-medium text-slate-500">
                  Bu salonun kullanım özelliklerini tanımlar. Kaydedilen bilgiler doğrulanmış salon bilgisi olarak kullanılır; Programı yalnız Ders Planı’nda salonu özelliğine göre seçilen dersler varsa etkiler.
                </p>
              </div>
              <button
                type="button"
                onClick={closeProfileEditor}
                disabled={profilePreviewing || profileApplying}
                className="rounded-lg px-2 py-1 text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <div className="management-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Salon özellikleri
                </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {data.availableCapabilities.map((capability) => {
                      const selected = profileCapabilities.includes(capability);

                      return (
                        <button
                          key={capability}
                          type="button"
                          onClick={() => toggleCapability(capability)}
                          disabled={profilePreviewing || profileApplying}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[10px] font-bold transition ${
                            selected
                              ? 'border-blue-300 bg-blue-50 text-blue-800'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] ${
                            selected
                              ? 'border-blue-500 bg-blue-500 text-white'
                              : 'border-slate-300 bg-white text-transparent'
                          }`}>
                            ✓
                          </span>
                          {capabilityLabel(capability)}
                        </button>
                      );
                    })}
                  </div>
              </div>

              {profileWizardActive && profileCapabilities.length === 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold text-amber-900">
                    En az bir salon özelliği seçin veya “Şimdilik atla” ile sıradaki salona geçin.
                  </p>
                </div>
              )}

                            {profileError && (
                <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-700">
                  {profileError}
                </p>
              )}

              {profilePreview && (
                <div className="mt-5 space-y-3">
                  <div className={`rounded-2xl border p-4 ${
                    profilePreview.canApply
                      ? 'border-emerald-200 bg-emerald-50'
                      : profilePreview.hasChanges
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-slate-200 bg-slate-50'
                  }`}>
                    <p className={`text-[10px] font-black ${
                      profilePreview.canApply
                        ? 'text-emerald-800'
                        : profilePreview.hasChanges
                          ? 'text-amber-800'
                          : 'text-slate-700'
                    }`}>
                      {profilePreview.canApply
                        ? profilePreview.affectedRequirementCount === 0
                          ? 'Bu değişiklik kaynak envanterini günceller.'
                          : 'Bu değişiklik güvenle uygulanabilir.'
                        : profilePreview.hasChanges
                          ? 'Bu değişiklik mevcut program yerleşimini etkiliyor.'
                          : 'Değişiklik yok.'}
                    </p>
                    <p className="mt-1 text-[10px] font-medium leading-5 text-slate-600">
                      {profilePreview.affectedRequirementCount === 0
                        ? 'Şu an salon özelliğine göre yerleştirilen ders yok. Programın uygun yer hesabı değişmeyecek.'
                        : `${profilePreview.affectedRequirementCount} ders tanımı · ${profilePreview.candidateRebuildCardCount} ders bloğunun uygun yerleri yeniden değerlendirilecek.`}
                    </p>
                  </div>

                  {(profilePreview.addedCapabilities.length > 0
                    || profilePreview.removedCapabilities.length > 0) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                          Eklenecek
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {profilePreview.addedCapabilities.length > 0
                            ? profilePreview.addedCapabilities.map((value) => (
                              <span key={value} className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-700">
                                {capabilityLabel(value)}
                              </span>
                            ))
                            : <span className="text-[9px] font-semibold text-slate-400">Yok</span>}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                          Kaldırılacak
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {profilePreview.removedCapabilities.length > 0
                            ? profilePreview.removedCapabilities.map((value) => (
                              <span key={value} className="rounded-full bg-rose-50 px-2 py-1 text-[8px] font-bold text-rose-700">
                                {capabilityLabel(value)}
                              </span>
                            ))
                            : <span className="text-[9px] font-semibold text-slate-400">Yok</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {profilePreview.placedImpacts.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-[10px] font-black text-amber-900">
                        Önce Program’da müdahale gerekiyor
                      </p>
                      <p className="mt-1 text-[10px] font-medium leading-5 text-amber-800">
                        Bu salonu kullanan yerleşmiş bloklardan bazıları yeni özelliklerle artık geçerli olmayacak.
                      </p>
                      <div className="mt-3 space-y-2">
                        {profilePreview.placedImpacts.map((impact) => (
                          <div key={impact.cardId} className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2">
                            <p className="text-[10px] font-bold text-slate-800">
                              {impact.subjectName} · {impact.groupName}
                            </p>
                            <p className="mt-0.5 text-[9px] font-medium text-slate-500">
                              Gereken özellik: {capabilityLabel(impact.requiredCapability)} · Gün {impact.dayOfWeek}, {impact.startPeriod}. ders
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4">
              <p className="text-[9px] font-medium text-slate-400">
                Önizleme hiçbir değişiklik yapmaz.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeProfileEditor}
                  disabled={profilePreviewing || profileApplying}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  {profileWizardActive ? 'Sihirbazdan çık' : 'Kapat'}
                </button>
                {profileWizardActive && (
                  <button
                    type="button"
                    onClick={skipProfileWizardRoom}
                    disabled={profilePreviewing || profileApplying}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[10px] font-black text-amber-800 hover:bg-amber-100 disabled:opacity-35"
                  >
                    Şimdilik atla
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void previewProfile()}
                  disabled={
                    profilePreviewing
                    || profileApplying
                    || (
                      profileWizardActive
                      && profileCapabilities.length === 0
                    )
                  }
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-35"
                >
                  {profilePreviewing
                    ? 'Etki hesaplanıyor…'
                    : profilePreview
                      ? 'Etkiyi yeniden hesapla'
                      : 'Etkiyi hesapla'}
                </button>
                {profilePreview?.canApply && (
                  <button
                    type="button"
                    onClick={() => void applyProfile()}
                    disabled={profilePreviewing || profileApplying}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-[10px] font-black text-white hover:bg-slate-800 disabled:opacity-35"
                  >
                    {profileApplying
                      ? 'Uygulanıyor…'
                      : profileWizardActive
                        ? 'Uygula ve sonraki salon'
                        : 'Değişikliği uygula'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/30 p-4">
          <div className="w-full max-w-[480px] rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                  {editTarget.kind === 'TEACHER' ? 'Öğretmen adı' : 'Salon adı'}
                </p>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  Taslakta görünen adı düzenle
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={saving}
                className="rounded-lg px-2 py-1 text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold leading-5 text-blue-800">
                Bu ad yalnız Yönetim taslağında kullanılır. Öğrenci / öğretmen programında
                yayınlanan ad şimdilik <strong>{editTarget.baseName}</strong> olarak kalır.
              </p>
            </div>

            <label className="mt-4 block">
              <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                Taslak ad
              </span>
              <input
                autoFocus
                type="text"
                maxLength={120}
                value={editName}
                onChange={(event) => {
                  setEditName(event.target.value);
                  setEditError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void saveName(editName);
                  }
                }}
                disabled={saving}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-slate-400 disabled:bg-slate-50"
              />
            </label>

            {editError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-700">
                {editError}
              </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                {editTarget.nameOverridden && (
                  <button
                    type="button"
                    onClick={() => void saveName(editTarget.baseName)}
                    disabled={saving}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Orijinal ada dön
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={() => void saveName(editName)}
                  disabled={
                    saving
                    || editName.trim().length === 0
                    || editName.trim() === editTarget.currentName
                  }
                  className="rounded-xl bg-slate-950 px-4 py-2 text-[10px] font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
