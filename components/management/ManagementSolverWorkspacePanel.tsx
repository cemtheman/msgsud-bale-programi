'use client';

import { useMemo, useState } from 'react';
import type {
  ManagementSolverObjectiveKey,
  ManagementSolverObjectiveProfile,
  ManagementSolverObjectiveWeights,
  ManagementSolverProfileInput,
  ManagementSolverProfileStatus,
  ManagementSolverRequirement,
  ManagementSolverWorkspace,
} from '@/lib/managementSolver';
import {
  runManagementFeasibilityPrototype,
  runManagementObjectiveOptimization,
  type ManagementFeasibilityResult,
  type ManagementOptimizationResult,
} from '@/lib/managementSolverPrototype';

const PRIORITY_LEVELS = [
  { value: 0, label: 'Kapalı' },
  { value: 250, label: 'Düşük' },
  { value: 500, label: 'Orta' },
  { value: 750, label: 'Yüksek' },
  { value: 1000, label: 'Çok yüksek' },
] as const;

const EMPTY_WEIGHTS: ManagementSolverObjectiveWeights = {
  changeCost: 0,
  preferredTeacherContinuity: 0,
  teacherIdleGaps: 0,
  roomStability: 0,
  teacherLoadBalance: 0,
  subjectTimePreference: 0,
};

const DAY_NAMES: Record<number, string> = {
  1: 'Pzt',
  2: 'Sal',
  3: 'Çar',
  4: 'Per',
  5: 'Cum',
};

const BASELINE_ISSUE_LABELS: Record<string, string> = {
  CARD_REQUIREMENT_MISSING: 'Dersin kural bilgisi eksik',
  BASELINE_PLACEMENT_MISSING: 'Ders programda yerleştirilmemiş',
  BASELINE_TIME_INVALID: 'Gün veya saat kurala uymuyor',
  REQUIRED_TEACHER_MISSING: 'Öğretmen belirtilmemiş',
  BASELINE_TEACHER_INACTIVE: 'Öğretmen kullanım dışı',
  BASELINE_TEACHER_OUTSIDE_PLANNING_POOL: 'Bu öğretmen otomatik yerleştirmede seçilemiyor',
  BASELINE_TEACHER_NOT_ALLOWED: 'Bu öğretmen bu ders için kullanılamıyor',
  BASELINE_ROOM_INACTIVE: 'Salon kullanım dışı',
  BASELINE_ROOM_OUTSIDE_PLANNING_POOL: 'Bu salon otomatik yerleştirmede seçilemiyor',
  BASELINE_ROOM_CAPABILITY_MISMATCH: 'Salon bu ders için uygun değil',
  BASELINE_TEACHER_CONFLICT: 'Öğretmen aynı saatte başka derste',
  BASELINE_ROOM_CONFLICT: 'Salon aynı saatte başka derste',
  BASELINE_GROUP_CONFLICT: 'Aynı öğrenciler aynı saatte başka derste',
  BASELINE_REQUIREMENT_TEACHER_CONTINUITY: 'Aynı öğretmenle devam etme kuralı bozuluyor',
  BASELINE_MIN_DISTINCT_DAYS: 'Ders yeterince farklı güne dağılmıyor',
  BASELINE_MAX_BLOCKS_PER_DAY: 'Aynı güne fazla ders konmuş',
  BASELINE_MAX_CONSECUTIVE_PERIODS: 'Aynı gün peş peşe fazla ders var',
};

function baselineIssueDetail(
  code: string,
  requirement: ManagementSolverRequirement | undefined,
) {
  if (!requirement) return null;

  if (
    code === 'BASELINE_MAX_CONSECUTIVE_PERIODS'
    && requirement.maxConsecutivePeriods != null
  ) {
    return `Bu ders aynı gün en fazla ${requirement.maxConsecutivePeriods} ders saati peş peşe yapılabilir.`;
  }

  if (
    code === 'BASELINE_MAX_BLOCKS_PER_DAY'
    && requirement.maxBlocksPerDay != null
  ) {
    return `Bu ders aynı gün en fazla ${requirement.maxBlocksPerDay} kez yapılabilir.`;
  }

  if (
    code === 'BASELINE_MIN_DISTINCT_DAYS'
    && requirement.minDistinctDays != null
  ) {
    return `Bu ders haftada en az ${requirement.minDistinctDays} farklı güne dağıtılmalı.`;
  }

  return null;
}

function displayGroupName(value: string) {
  return value
    .replace(/^STANDARD\s*·\s*/i, '')
    .replace(/\bPARALELL\b/gi, 'PARALEL')
    .replace(/\bPARALLEL\b/gi, 'PARALEL')
    .replace(/\bSHARED\b/gi, 'ORTAK')
    .replace(/\bBALLET\b/gi, 'BALE')
    .replace(/\bMUSIC\b/gi, 'MÜZİK')
    .replace(/\bSECTION\b/gi, 'ŞUBE');
}

function placementSummary(
  dayOfWeek: number | null,
  startPeriod: number | null,
  teacherName: string | null,
  roomName: string | null,
) {
  const time = dayOfWeek != null && startPeriod != null
    ? `${DAY_NAMES[dayOfWeek] ?? dayOfWeek} · ${startPeriod}. ders`
    : 'Yerleşmemiş';
  const resources = [
    teacherName,
    roomName,
  ].filter(Boolean).join(' · ');

  return resources ? `${time} · ${resources}` : time;
}

const OBJECTIVES: Array<{
  key: ManagementSolverObjectiveKey;
  title: string;
  summary: string;
  baseline: (workspace: ManagementSolverWorkspace) => string;
}> = [
  {
    key: 'changeCost',
    title: 'Mevcut programı mümkün olduğunca koru',
    summary:
      'Gün, saat, öğretmen ve salonları gereksiz yere değiştirmemeye öncelik verir.',
    baseline: () => 'Karşılaştırma mevcut program üzerinden yapılır.',
  },
  {
    key: 'preferredTeacherContinuity',
    title: 'Aynı öğretmeni mümkün olduğunca koru',
    summary:
      'Öğretmeni değişebilen derslerde aynı öğretmenin devam etmesine öncelik verir.',
    baseline: (workspace) =>
      `Mevcut programda: ${workspace.preview.baselineMetrics.preferredTeacherContinuityBreaks} öğretmen değişimi`,
  },
  {
    key: 'teacherIdleGaps',
    title: 'Öğretmen boşluklarını azalt',
    summary:
      'Bir öğretmenin aynı gündeki dersleri arasında kalan boş ders saatlerini azaltmayı tercih eder.',
    baseline: (workspace) =>
      `Mevcut program: ${workspace.preview.baselineMetrics.teacherIdleGapPeriods} boş ders aralığı`,
  },
  {
    key: 'roomStability',
    title: 'Aynı dersi mümkün olduğunca aynı salonda tut',
    summary:
      'Aynı dersin farklı günlerde gereksiz yere farklı salonlara taşınmasını azaltır.',
    baseline: (workspace) =>
      `Mevcut programda: ${workspace.preview.baselineMetrics.roomStabilityBreaks} salon değişimi`,
  },
];

function statusMeta(status: ManagementSolverProfileStatus) {
  if (status === 'ACTIVE') {
    return {
      label: 'Kullanılıyor',
      className: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (status === 'ARCHIVED') {
    return {
      label: 'Arşivde',
      className: 'bg-slate-100 text-slate-500',
    };
  }

  return {
    label: 'Taslak',
    className: 'bg-amber-100 text-amber-700',
  };
}

function profileWeights(
  profile: ManagementSolverObjectiveProfile | null,
): ManagementSolverObjectiveWeights {
  return profile
    ? { ...EMPTY_WEIGHTS, ...profile.weights }
    : { ...EMPTY_WEIGHTS };
}

function weightsEqual(
  left: ManagementSolverObjectiveWeights,
  right: ManagementSolverObjectiveWeights,
) {
  return Object.keys(EMPTY_WEIGHTS).every((key) => (
    left[key as ManagementSolverObjectiveKey]
    === right[key as ManagementSolverObjectiveKey]
  ));
}

export function ManagementSolverWorkspacePanel({
  data,
  canEdit,
  busy,
  onSave,
}: {
  data: ManagementSolverWorkspace | null;
  canEdit: boolean;
  busy: boolean;
  onSave: (input: ManagementSolverProfileInput) => Promise<void>;
}) {
  const initialProfile = data?.profiles.find((profile) => profile.status === 'ACTIVE')
    ?? data?.profiles.find((profile) => profile.status === 'DRAFT')
    ?? null;

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    initialProfile?.id ?? null,
  );
  const [name, setName] = useState(initialProfile?.name ?? '');
  const [description, setDescription] = useState(initialProfile?.description ?? '');
  const [weights, setWeights] = useState<ManagementSolverObjectiveWeights>(
    profileWeights(initialProfile),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [feasibilityResult, setFeasibilityResult] = useState<ManagementFeasibilityResult | null>(null);
  const [feasibilityBusy, setFeasibilityBusy] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<ManagementOptimizationResult | null>(null);
  const [optimizationBusy, setOptimizationBusy] = useState(false);
  const [pendingSelectionId, setPendingSelectionId] = useState<string | '__NEW__' | null>(null);
  const [activationPending, setActivationPending] = useState(false);

  const selectedProfile = useMemo(
    () => data?.profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [data?.profiles, selectedProfileId],
  );
  const activeProfile = useMemo(
    () => data?.profiles.find((profile) => profile.id === data.activeProfileId) ?? null,
    [data?.activeProfileId, data?.profiles],
  );
  const savedWeights = profileWeights(selectedProfile);
  const isDirty = (
    name !== (selectedProfile?.name ?? '')
    || description !== (selectedProfile?.description ?? '')
    || !weightsEqual(weights, savedWeights)
  );
  const selectedIsActive = (
    selectedProfile != null
    && selectedProfile.id === data?.activeProfileId
  );

  if (!data) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-500">
          Program tercihleri alınamadı.
        </div>
      </section>
    );
  }

  const hardReady = data.preview.readiness.hardInputReady;
  const provisionalInputs = data.preview.readiness.provisionalInputs ?? [];
  const unknownRooms = provisionalInputs.find(
    (item) => item.code === 'RESOURCE_MODE_UNKNOWN',
  ) ?? null;
  const positiveObjectiveCount = OBJECTIVES.filter(
    (objective) => weights[objective.key] > 0,
  ).length;
  const canActivate = (
    canEdit
    && !busy
    && name.trim().length > 0
    && positiveObjectiveCount > 0
  );
  const changedCardIds = new Set(
    feasibilityResult?.changedCards?.map((item) => item.cardId) ?? [],
  );
  const additionalBaselineIssues = (
    feasibilityResult?.baselineIssues ?? []
  ).filter((issue) => !changedCardIds.has(issue.cardId));

  const loadProfile = (profile: ManagementSolverObjectiveProfile | null) => {
    setSelectedProfileId(profile?.id ?? null);
    setName(profile?.name ?? '');
    setDescription(profile?.description ?? '');
    setWeights(profileWeights(profile));
    setOptimizationResult(null);
    setActivationPending(false);
    setPendingSelectionId(null);
    setLocalError(null);
  };

  const requestLoadProfile = (
    profile: ManagementSolverObjectiveProfile | null,
  ) => {
    const targetId = profile?.id ?? '__NEW__';

    if (
      targetId === (selectedProfileId ?? '__NEW__')
      && pendingSelectionId == null
    ) {
      return;
    }

    if (isDirty) {
      setPendingSelectionId(targetId);
      return;
    }

    loadProfile(profile);
  };

  const confirmPendingSelection = () => {
    if (pendingSelectionId == null) return;

    if (pendingSelectionId === '__NEW__') {
      loadProfile(null);
      return;
    }

    loadProfile(
      data.profiles.find(
        (profile) => profile.id === pendingSelectionId,
      ) ?? null,
    );
  };

  const updateName = (value: string) => {
    setName(value);
    setOptimizationResult(null);
    setActivationPending(false);
    setPendingSelectionId(null);
  };

  const updateDescription = (value: string) => {
    setDescription(value);
    setOptimizationResult(null);
    setActivationPending(false);
    setPendingSelectionId(null);
  };

  const updateWeight = (
    key: ManagementSolverObjectiveKey,
    value: number,
  ) => {
    setWeights((current) => ({
      ...current,
      [key]: value,
    }));
    setOptimizationResult(null);
    setActivationPending(false);
    setPendingSelectionId(null);
  };

  const runFeasibility = () => {
    if (!hardReady || feasibilityBusy) return;

    setFeasibilityBusy(true);
    setLocalError(null);

    try {
      setFeasibilityResult(
        runManagementFeasibilityPrototype(data.preview),
      );
    } catch (reason: unknown) {
      setFeasibilityResult(null);
      setLocalError(
        reason instanceof Error
          ? reason.message
          : 'Program kontrolü tamamlanamadı.',
      );
    } finally {
      setFeasibilityBusy(false);
    }
  };

  const runOptimization = () => {
    if (
      !hardReady
      || optimizationBusy
      || positiveObjectiveCount === 0
    ) {
      return;
    }

    setOptimizationBusy(true);
    setLocalError(null);

    try {
      setOptimizationResult(
        runManagementObjectiveOptimization(
          data.preview,
          weights,
        ),
      );
    } catch (reason: unknown) {
      setOptimizationResult(null);
      setLocalError(
        reason instanceof Error
          ? reason.message
          : 'Program seçeneği oluşturulamadı.',
      );
    } finally {
      setOptimizationBusy(false);
    }
  };

  const requestActivate = () => {
    if (!canActivate) return;

    if (
      activeProfile
      && activeProfile.id !== selectedProfile?.id
    ) {
      setActivationPending(true);
      return;
    }

    void save('ACTIVE');
  };

  const save = async (status: ManagementSolverProfileStatus) => {
    if (!canEdit || busy) return;

    if (name.trim().length === 0) {
      setLocalError('Ayar adı gerekli.');
      return;
    }

    if (status === 'ACTIVE' && positiveObjectiveCount === 0) {
      setLocalError('Bu ayarları kullanmak için en az bir tercihe öncelik verin.');
      return;
    }

    setLocalError(null);

    try {
      await onSave({
        profileId: selectedProfileId,
        requirementSetId: data.requirementSetId,
        name: name.trim(),
        description: description.trim() || null,
        weights,
        status,
      });
    } catch (reason: unknown) {
      setLocalError(
        reason instanceof Error
          ? reason.message
          : 'Tercih ayarları kaydedilemedi.',
      );
    }
  };

  return (
    <section className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto grid max-w-[1460px] grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="sticky top-4 self-start rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#A63D48]">
                Öncelikler
              </p>
              <h2 className="mt-1 text-[15px] font-black text-slate-950">
                Kayıtlı ayarlar
              </h2>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => requestLoadProfile(null)}
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[9px] font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                + Yeni
              </button>
            )}
          </div>

          <p className="mt-2 text-[10px] font-medium leading-5 text-slate-500">
            Birden fazla uygun program olduğunda hangisinin tercih edileceğini buradaki ayarlar belirler.
          </p>

          <div className="mt-4 space-y-2">
            {data.profiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[10px] font-semibold leading-5 text-slate-500">
                Henüz kayıtlı ayar yok. Yeni bir ayar oluşturup öncelikleri seçin.
              </div>
            ) : (
              data.profiles.map((profile) => {
                const selected = profile.id === selectedProfileId;
                const meta = statusMeta(profile.status);

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => requestLoadProfile(profile)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[10px] font-black">
                        {profile.name}
                      </p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className={`mt-1 text-[9px] font-semibold ${
                      selected ? 'text-slate-300' : 'text-slate-400'
                    }`}>
                      {Object.values(profile.weights).filter((value) => value > 0).length} tercih açık
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {pendingSelectionId != null && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[9px] font-black text-amber-900">
                Kaydedilmemiş değişiklikler var
              </p>
              <p className="mt-1 text-[8px] font-medium leading-4 text-amber-800">
                Başka bir ayara geçerseniz bu değişiklikler kaybolacak.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingSelectionId(null)}
                  className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[8px] font-black text-amber-800"
                >
                  Burada kal
                </button>
                <button
                  type="button"
                  onClick={confirmPendingSelection}
                  className="rounded-lg bg-amber-700 px-2.5 py-1.5 text-[8px] font-black text-white"
                >
                  Değişiklikleri bırak ve geç
                </button>
              </div>
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                  1 · Tercih ayarı
                </p>
                <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                  Program hazırlanırken nelere öncelik verilsin?
                </h1>
                <p className="mt-2 max-w-3xl text-[10px] font-medium leading-5 text-slate-600">
                  Zorunlu kurallar değişmez. Buradaki tercihler, birden fazla uygun program olduğunda
                  hangisinin öne çıkacağını belirler.
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <span className={`rounded-full px-3 py-1.5 text-[9px] font-black ${
                  hardReady
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}>
                  {hardReady ? 'Kurallar hazır' : 'Kural bilgileri eksik'}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black text-slate-600">
                  {activeProfile
                    ? `Kullanımda: ${activeProfile.name}`
                    : 'Kullanımda olan ayar yok'}
                </span>
                {isDirty && (
                  <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[9px] font-black text-amber-700">
                    Kaydedilmemiş değişiklikler
                  </span>
                )}
              </div>
            </div>

          </section>

          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <label className="block">
                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Ayar adı
                </span>
                <input
                  value={name}
                  onChange={(event) => updateName(event.target.value)}
                  disabled={!canEdit || busy}
                  placeholder="Örn. Dengeli dönem programı"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white disabled:opacity-50"
                />
              </label>

              <div>
                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Durum
                </span>
                <div className="flex h-[38px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
                  <span className="text-[10px] font-bold text-slate-600">
                    {selectedProfile
                      ? selectedIsActive
                        ? isDirty
                          ? 'Kullanımda · değiştirildi'
                          : 'Kullanımda'
                        : isDirty
                          ? 'Taslak · değiştirildi'
                          : statusMeta(selectedProfile.status).label
                      : isDirty
                        ? 'Yeni · kaydedilmedi'
                        : 'Yeni ayar'}
                  </span>
                </div>
              </div>
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Not · isteğe bağlı
              </span>
              <input
                value={description}
                onChange={(event) => updateDescription(event.target.value)}
                disabled={!canEdit || busy}
                placeholder="Bu ayar ne zaman veya hangi amaçla kullanılacak?"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white disabled:opacity-50"
              />
            </label>
          </section>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {OBJECTIVES.map((objective) => {
              const current = weights[objective.key];

              return (
                <section
                  key={objective.key}
                  className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <h3 className="text-[12px] font-black text-slate-950">
                    {objective.title}
                  </h3>
                  <p className="mt-1 text-[9px] font-medium leading-4 text-slate-500">
                    {objective.summary}
                  </p>
                  <p className="mt-2 text-[9px] font-bold text-slate-400">
                    {objective.baseline(data)}
                  </p>

                  <div className="mt-4 grid grid-cols-5 gap-1">
                    {PRIORITY_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        type="button"
                        disabled={!canEdit || busy}
                        onClick={() => updateWeight(
                          objective.key,
                          level.value,
                        )}
                        className={`rounded-lg px-1 py-2 text-[8px] font-black transition ${
                          current === level.value
                            ? 'bg-slate-950 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        } disabled:opacity-50`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
            <p className="text-[9px] font-black text-slate-600">
              Daha sonra açılacak tercihler
            </p>
            <p className="mt-1 text-[8px] font-medium leading-4 text-slate-400">
              Öğretmen yük dengesi · Derslerin tercih edilen gün ve saatleri
            </p>
          </div>

          {localError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-bold text-rose-700">
              {localError}
            </div>
          )}

          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black text-slate-900">
                    {selectedProfile
                      ? selectedProfile.name
                      : name.trim() || 'Yeni ayar'}
                  </p>
                  {isDirty && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-black text-amber-700">
                      Kaydedilmedi
                    </span>
                  )}
                  {selectedIsActive && !isDirty && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-black text-emerald-700">
                      Kullanımda
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[9px] font-medium leading-4 text-slate-500">
                  {selectedIsActive
                    ? isDirty
                      ? 'Bu ayar kullanımda. Değişiklikler ancak kaydettiğinizde geçerli olur.'
                      : 'Bu ayar şu anda yeni program seçeneklerinde varsayılan olarak kullanılıyor.'
                    : 'İsterseniz kaydetmeden seçenek üretebilir; hazır olduğunda taslak olarak saklayabilir veya kullanıma alabilirsiniz.'}
                </p>
                <p className="mt-1 text-[8px] font-bold text-slate-400">
                  {positiveObjectiveCount} tercih açık
                </p>
              </div>

              {canEdit ? (
                selectedIsActive ? (
                  <button
                    type="button"
                    onClick={() => void save('ACTIVE')}
                    disabled={
                      busy
                      || !isDirty
                      || name.trim().length === 0
                      || positiveObjectiveCount === 0
                    }
                    className="rounded-xl bg-[#A63D48] px-4 py-2.5 text-[10px] font-black text-white hover:bg-[#8F3340] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {isDirty ? 'Değişiklikleri kaydet' : 'Kaydedildi · kullanımda'}
                  </button>
                ) : (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void save('DRAFT')}
                      disabled={
                        busy
                        || !isDirty
                        || name.trim().length === 0
                      }
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Taslak olarak kaydet
                    </button>
                    <button
                      type="button"
                      onClick={requestActivate}
                      disabled={!canActivate}
                      className="rounded-xl bg-[#A63D48] px-4 py-2.5 text-[10px] font-black text-white hover:bg-[#8F3340] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {selectedProfile && !isDirty
                        ? 'Kullanıma al'
                        : 'Kaydet ve kullan'}
                    </button>
                  </div>
                )
              ) : (
                <span className="text-[10px] font-semibold text-slate-400">
                  Salt okunur
                </span>
              )}
            </div>

            {activationPending && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                <div>
                  <p className="text-[9px] font-black text-amber-900">
                    Kullanımdaki ayar değiştirilecek
                  </p>
                  <p className="mt-1 text-[8px] font-medium leading-4 text-amber-800">
                    “{activeProfile?.name}” yerine “{name.trim()}” kullanılacak.
                    Mevcut program değişmez; yalnız bundan sonraki seçenek hesaplarında bu ayar varsayılan olur.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActivationPending(false)}
                    className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[8px] font-black text-amber-800"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActivationPending(false);
                      void save('ACTIVE');
                    }}
                    className="rounded-lg bg-amber-700 px-3 py-1.5 text-[8px] font-black text-white"
                  >
                    Onayla ve kullan
                  </button>
                </div>
              </div>
            )}
          </div>
          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#A63D48]">
                  2 · Program kontrolü
                </p>
                <h2 className="mt-1 text-[15px] font-black text-slate-950">
                  Mevcut program kurallara uygun mu?
                </h2>
                <p className="mt-2 text-[10px] font-medium leading-5 text-slate-600">
                  Bu kontrol mevcut programı değiştirmeden kurallara uygunluğunu sınar.
                  Gerekirse yalnızca karşılaştırma için alternatif bir yerleşim hesaplar.
                </p>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[9px] font-bold leading-4 text-slate-600">
                    “Programı kontrol et” yalnız zorunlu kuralları denetler.
                    Öncelikleri kullanmak için aşağıdaki “Bu tercihlerle seçenek oluştur” işlemini kullanın.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={runFeasibility}
                disabled={!hardReady || feasibilityBusy}
                className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {feasibilityBusy ? 'Kontrol ediliyor…' : 'Programı kontrol et'}
              </button>
            </div>

            {unknownRooms && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3">
                <p className="text-[10px] font-black text-blue-950">
                  {unknownRooms.count} dersin salonu henüz kesinleşmedi
                </p>
                <p className="mt-1 text-[9px] font-medium leading-4 text-blue-800">
                  Bu durum program oluşturmayı engellemez. {unknownRooms.withBaselineRoomEvidence ?? 0} derste
                  mevcut salon bilgisi var; {unknownRooms.withoutBaselineRoomEvidence ?? 0} derste salon daha sonra belirlenecek.
                </p>
              </div>
            )}

            {!hardReady && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-bold text-rose-700">
                Kural bilgileri eksik olduğu için program kontrol edilemiyor.
              </div>
            )}

            {feasibilityResult && (
              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_repeat(2,minmax(140px,auto))] gap-2">
                <div className={`rounded-2xl border px-4 py-3 ${
                  feasibilityResult.status === 'FEASIBLE'
                    ? 'border-emerald-200 bg-emerald-50'
                    : feasibilityResult.status === 'SEARCH_LIMIT'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-rose-200 bg-rose-50'
                }`}>
                  <p className={`text-[10px] font-black ${
                    feasibilityResult.status === 'FEASIBLE'
                      ? 'text-emerald-800'
                      : feasibilityResult.status === 'SEARCH_LIMIT'
                        ? 'text-amber-800'
                        : 'text-rose-800'
                  }`}>
                    {feasibilityResult.status === 'FEASIBLE'
                      ? 'Kurallara uygun bir yerleşim bulundu'
                      : feasibilityResult.status === 'SEARCH_LIMIT'
                        ? 'Arama sınırına ulaşıldı'
                        : 'Geçerli yerleşim bulunamadı'}
                  </p>
                  <p className="mt-1 text-[9px] font-medium leading-4 text-slate-600">
                    {feasibilityResult.status === 'FEASIBLE' && feasibilityResult.baselineWasFeasible
                      ? 'Mevcut program bütün zorunlu kuralları karşılıyor.'
                      : feasibilityResult.status === 'FEASIBLE'
                        ? 'Mevcut programda bazı uyuşmazlıklar var; karşılaştırma için uygun bir alternatif bulundu.'
                        : feasibilityResult.reasons.join(' · ')}
                  </p>
                  <p className="mt-2 text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Bu işlem programı değiştirmedi
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Yerinde kalan ders
                  </p>
                  <p className="mt-1 text-[14px] font-black text-slate-900">
                    {feasibilityResult.metrics.baselineReuseCount}/{feasibilityResult.metrics.cardCount}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Salonu henüz belirlenmeyen ders
                  </p>
                  <p className="mt-1 text-[14px] font-black text-slate-900">
                    {feasibilityResult.metrics.provisionalRoomCount}
                  </p>
                </div>
              </div>
            )}
            {feasibilityResult?.changedCards && feasibilityResult.changedCards.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black text-amber-950">
                      Kurallara uygun bir seçenek bulmak için {feasibilityResult.changedCards.length} dersin yeri değişti
                    </p>
                    <p className="mt-1 max-w-4xl text-[9px] font-medium leading-4 text-amber-800">
                      Bu yalnızca karşılaştırmadır; program değişmedi. Aşağıda hangi derslerin neden etkilendiğini görebilirsiniz.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[8px] font-black text-amber-700">
                    {feasibilityResult.baselineIssues?.length ?? 0} kural uyuşmazlığı
                  </span>
                </div>

                <div className="mt-3 grid gap-2">
                  {feasibilityResult.changedCards.map((item) => (
                    <div
                      key={item.cardId}
                      className="rounded-xl border border-amber-100 bg-white px-3 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-black text-slate-900">
                            {displayGroupName(item.groupName)} · {item.subjectName} · {item.blockIndex}. bölüm
                          </p>
                          <p className="mt-1 text-[9px] font-medium text-slate-500">
                            Önce: {placementSummary(
                              item.baseline.dayOfWeek,
                              item.baseline.startPeriod,
                              item.baseline.teacherName,
                              item.baseline.roomName,
                            )}
                          </p>
                          <p className="mt-0.5 text-[9px] font-bold text-slate-700">
                            Alternatif yerleşim: {placementSummary(
                              item.proposed.dayOfWeek,
                              item.proposed.startPeriod,
                              item.proposed.teacherName,
                              item.proposed.roomName,
                            )}
                          </p>
                        </div>
                      </div>

                      {item.baselineIssueCodes.length > 0 ? (
                        <div className="mt-2">
                          <div className="flex flex-wrap gap-1.5">
                            {item.baselineIssueCodes.map((code) => (
                              <span
                                key={code}
                                className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black text-amber-800"
                                title={BASELINE_ISSUE_LABELS[code] ?? 'Program kuralı uyarısı'}
                              >
                                {BASELINE_ISSUE_LABELS[code] ?? code}
                              </span>
                            ))}
                          </div>
                          {item.baselineIssueCodes.map((code) => {
                            const detail = baselineIssueDetail(
                              code,
                              data.preview.requirements.find(
                                (requirement) => requirement.id === item.requirementId,
                              ),
                            );

                            return detail ? (
                              <p
                                key={`${code}-detail`}
                                className="mt-1.5 text-[8px] font-semibold text-amber-800"
                              >
                                {detail}
                              </p>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <p className="mt-2 text-[8px] font-bold text-slate-400">
                          Bu derste doğrudan bir sorun yok; diğer derslerdeki uyuşmazlıkları gidermek için alternatif yerleşimde yeri değişti.
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {additionalBaselineIssues.length > 0 && (
                  <div className="mt-4 border-t border-amber-200 pt-3">
                    <p className="text-[9px] font-black text-amber-950">
                      Yeri değişmeden kalan diğer uyarılı dersler
                    </p>
                    <p className="mt-1 text-[8px] font-medium leading-4 text-amber-800">
                      Bu derslerin yeri değişmedi; ancak aynı kural uyuşmazlığından etkileniyorlar.
                    </p>

                    <div className="mt-2 grid gap-2">
                      {additionalBaselineIssues.map((issue) => {
                        const requirement = data.preview.requirements.find(
                          (item) => item.id === issue.requirementId,
                        );
                        const placement = data.preview.baselinePlacements.find(
                          (item) => item.cardId === issue.cardId,
                        );
                        const teacherName = placement?.teacherId
                          ? data.preview.teachers.find(
                            (item) => item.id === placement.teacherId,
                          )?.name ?? null
                          : null;
                        const roomName = placement?.roomId
                          ? data.preview.rooms.find(
                            (item) => item.id === placement.roomId,
                          )?.name ?? null
                          : null;

                        return (
                          <div
                            key={issue.cardId}
                            className="rounded-xl border border-amber-100 bg-white px-3 py-2.5"
                          >
                            <p className="text-[9px] font-black text-slate-900">
                              {displayGroupName(issue.groupName)} · {issue.subjectName} · {issue.blockIndex}. bölüm
                            </p>
                            <p className="mt-1 text-[8px] font-medium text-slate-500">
                              Mevcut: {placementSummary(
                                placement?.dayOfWeek ?? null,
                                placement?.startPeriod ?? null,
                                teacherName,
                                roomName,
                              )}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {issue.codes.map((code) => (
                                <span
                                  key={code}
                                  className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black text-amber-800"
                                >
                                  {BASELINE_ISSUE_LABELS[code] ?? 'Program kuralı uyarısı'}
                                </span>
                              ))}
                            </div>
                            {issue.codes.map((code) => {
                              const detail = baselineIssueDetail(code, requirement);
                              return detail ? (
                                <p
                                  key={`${code}-detail`}
                                  className="mt-1.5 text-[8px] font-semibold text-amber-800"
                                >
                                  {detail}
                                </p>
                              ) : null;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#A63D48]">
                  3 · Program seçeneği
                </p>
                <h2 className="mt-1 text-[15px] font-black text-slate-950">
                  Bu tercihlere göre daha uygun bir yerleşim var mı?
                </h2>
                <p className="mt-2 text-[10px] font-medium leading-5 text-slate-600">
                  Ekranda seçili öncelikleri kullanarak mevcut programa yakın alternatifleri karşılaştırır.
                  Denemek için ayarı kaydetmeniz gerekmez; sonuç yalnızca öneridir ve programı değiştirmez.
                </p>
              </div>

              <button
                type="button"
                onClick={runOptimization}
                disabled={
                  !hardReady
                  || optimizationBusy
                  || positiveObjectiveCount === 0
                }
                className="shrink-0 rounded-xl bg-[#A63D48] px-4 py-2.5 text-[10px] font-black text-white hover:bg-[#8F3340] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {optimizationBusy
                  ? 'Seçenek aranıyor…'
                  : 'Bu tercihlerle seçenek oluştur'}
              </button>
            </div>

            {positiveObjectiveCount === 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[9px] font-bold text-amber-800">
                Önce en az bir tercihe Düşük, Orta, Yüksek veya Çok yüksek öncelik verin.
              </div>
            )}

            {optimizationResult && (
              <div className="mt-4">
                <div className={`rounded-2xl border px-4 py-3 ${
                  optimizationResult.status === 'IMPROVED'
                    ? 'border-emerald-200 bg-emerald-50'
                    : optimizationResult.status === 'UNCHANGED'
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-amber-200 bg-amber-50'
                }`}>
                  <p className={`text-[10px] font-black ${
                    optimizationResult.status === 'IMPROVED'
                      ? 'text-emerald-800'
                      : optimizationResult.status === 'UNCHANGED'
                        ? 'text-slate-800'
                        : 'text-amber-800'
                  }`}>
                    {optimizationResult.status === 'IMPROVED'
                      ? 'Bu tercihlere göre daha uygun bir seçenek bulundu'
                      : optimizationResult.status === 'UNCHANGED'
                        ? 'Mevcut programa yakın seçenekler içinde daha uygunu bulunamadı'
                        : 'Bu tercihlerle seçenek oluşturulamadı'}
                  </p>
                  <p className="mt-1 text-[9px] font-medium leading-4 text-slate-600">
                    {optimizationResult.status === 'IMPROVED'
                      ? `${optimizationResult.changedCards.length} ders için farklı yerleşim öneriliyor.`
                      : optimizationResult.status === 'UNCHANGED'
                        ? 'Mevcut program korunuyor.'
                        : 'Önce program kontrolünün temiz olduğundan ve en az bir tercihin açık olduğundan emin olun.'}
                  </p>
                  <p className="mt-2 text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Bu işlem programı değiştirmedi
                  </p>
                </div>

                {optimizationResult.status !== 'BLOCKED' && (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <p className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">
                          Değişen karar
                        </p>
                        <p className="mt-1 text-[11px] font-black text-slate-900">
                          {optimizationResult.baselineMetrics.changeCost}
                          {' → '}
                          {optimizationResult.proposedMetrics.changeCost}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <p className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">
                          Öğretmen değişimi
                        </p>
                        <p className="mt-1 text-[11px] font-black text-slate-900">
                          {optimizationResult.baselineMetrics.preferredTeacherContinuityBreaks}
                          {' → '}
                          {optimizationResult.proposedMetrics.preferredTeacherContinuityBreaks}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <p className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">
                          Öğretmen boşluğu
                        </p>
                        <p className="mt-1 text-[11px] font-black text-slate-900">
                          {optimizationResult.baselineMetrics.teacherIdleGapPeriods}
                          {' → '}
                          {optimizationResult.proposedMetrics.teacherIdleGapPeriods}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <p className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">
                          Salon değişimi
                        </p>
                        <p className="mt-1 text-[11px] font-black text-slate-900">
                          {optimizationResult.baselineMetrics.roomStabilityBreaks}
                          {' → '}
                          {optimizationResult.proposedMetrics.roomStabilityBreaks}
                        </p>
                      </div>
                    </div>

                    {optimizationResult.changedCards.length > 0 && (
                      <div className="mt-3 grid gap-2">
                        {optimizationResult.changedCards.slice(0, 12).map((item) => (
                          <div
                            key={item.cardId}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                          >
                            <p className="text-[9px] font-black text-slate-900">
                              {displayGroupName(item.groupName)} · {item.subjectName} · {item.blockIndex}. bölüm
                            </p>
                            <p className="mt-1 text-[8px] font-medium text-slate-500">
                              Mevcut: {placementSummary(
                                item.baseline.dayOfWeek,
                                item.baseline.startPeriod,
                                item.baseline.teacherName,
                                item.baseline.roomName,
                              )}
                            </p>
                            <p className="mt-0.5 text-[8px] font-bold text-slate-700">
                              Öneri: {placementSummary(
                                item.proposed.dayOfWeek,
                                item.proposed.startPeriod,
                                item.proposed.teacherName,
                                item.proposed.roomName,
                              )}
                            </p>
                          </div>
                        ))}

                        {optimizationResult.changedCards.length > 12 && (
                          <p className="text-[8px] font-bold text-slate-400">
                            Ayrıca {optimizationResult.changedCards.length - 12} ders daha değişiyor.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

        </div>
      </div>
    </section>
  );
}
