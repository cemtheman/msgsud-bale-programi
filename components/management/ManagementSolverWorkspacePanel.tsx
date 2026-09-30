'use client';

import { useMemo, useState } from 'react';
import type {
  ManagementSolverObjectiveKey,
  ManagementSolverObjectiveProfile,
  ManagementSolverObjectiveWeights,
  ManagementSolverProfileInput,
  ManagementSolverProfileStatus,
  ManagementSolverWorkspace,
} from '@/lib/managementSolver';
import {
  runManagementFeasibilityPrototype,
  type ManagementFeasibilityResult,
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
  CARD_REQUIREMENT_MISSING: 'Ders kuralı bulunamadı',
  BASELINE_PLACEMENT_MISSING: 'Mevcut yerleşim eksik',
  BASELINE_TIME_INVALID: 'Mevcut gün/saat zorunlu kurala uymuyor',
  REQUIRED_TEACHER_MISSING: 'Zorunlu öğretmen eksik',
  BASELINE_TEACHER_INACTIVE: 'Mevcut öğretmen aktif değil',
  BASELINE_TEACHER_OUTSIDE_PLANNING_POOL: 'Mevcut öğretmen otomatik planlama seçeneklerinde değil',
  BASELINE_TEACHER_NOT_ALLOWED: 'Mevcut öğretmen seçimi otomatik yerleştirme için kullanılamıyor',
  BASELINE_ROOM_INACTIVE: 'Mevcut salon aktif değil',
  BASELINE_ROOM_OUTSIDE_PLANNING_POOL: 'Mevcut salon otomatik planlama seçeneklerinde değil',
  BASELINE_ROOM_CAPABILITY_MISMATCH: 'Mevcut salon gerekli yeteneğe uymuyor',
  BASELINE_TEACHER_CONFLICT: 'Mevcut programda öğretmen çakışması',
  BASELINE_ROOM_CONFLICT: 'Mevcut programda salon çakışması',
  BASELINE_GROUP_CONFLICT: 'Mevcut programda öğrenci grubu çakışması',
  BASELINE_REQUIREMENT_TEACHER_CONTINUITY: 'Zorunlu öğretmen devamlılığı bozuluyor',
  BASELINE_MIN_DISTINCT_DAYS: 'Ders yeterli farklı güne yayılmıyor',
  BASELINE_MAX_BLOCKS_PER_DAY: 'Aynı gün blok sınırı aşılıyor',
  BASELINE_MAX_CONSECUTIVE_PERIODS: 'Ardışık ders sınırı aşılıyor',
};

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
    title: 'Mevcut programa sadakat',
    summary:
      'Yeni çözümün mevcut gün, saat, öğretmen ve salon kararlarını gereksiz yere değiştirmemesini tercih eder.',
    baseline: () => 'Mevcut program bu ölçekte başlangıç noktasıdır.',
  },
  {
    key: 'preferredTeacherContinuity',
    title: 'Esnek derslerde öğretmen devamlılığı',
    summary:
      'Öğretmeni blok bazında esnek olan fakat aynı öğretmenin sürmesi tercih edilen derslerde sürekliliği korumaya çalışır.',
    baseline: (workspace) =>
      `Mevcut program: ${workspace.preview.baselineMetrics.preferredTeacherContinuityBreaks} süreklilik kırılması`,
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
    title: 'Salon istikrarını koru',
    summary:
      'Aynı dersin bloklarının gereksiz biçimde farklı salonlara dağılmasını azaltmayı tercih eder.',
    baseline: (workspace) =>
      `Mevcut program: ${workspace.preview.baselineMetrics.roomStabilityBreaks} salon değişimi göstergesi`,
  },
];

function statusMeta(status: ManagementSolverProfileStatus) {
  if (status === 'ACTIVE') {
    return {
      label: 'Etkin',
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

  const selectedProfile = useMemo(
    () => data?.profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [data?.profiles, selectedProfileId],
  );

  if (!data) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-500">
          Optimizasyon hazırlığı verisi alınamadı.
        </div>
      </section>
    );
  }

  const hardReady = data.preview.readiness.hardInputReady;
  const objectiveReady = data.preview.readiness.objectiveProfileReady;
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

  const loadProfile = (profile: ManagementSolverObjectiveProfile | null) => {
    setSelectedProfileId(profile?.id ?? null);
    setName(profile?.name ?? '');
    setDescription(profile?.description ?? '');
    setWeights(profileWeights(profile));
    setLocalError(null);
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
          : 'Uygunluk kontrolü tamamlanamadı.',
      );
    } finally {
      setFeasibilityBusy(false);
    }
  };

  const save = async (status: ManagementSolverProfileStatus) => {
    if (!canEdit || busy) return;

    if (name.trim().length === 0) {
      setLocalError('Profil adı gerekli.');
      return;
    }

    if (status === 'ACTIVE' && positiveObjectiveCount === 0) {
      setLocalError('Etkin profil için en az bir hedefe öncelik verin.');
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
          : 'Optimizasyon profili kaydedilemedi.',
      );
    }
  };

  return (
    <section className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto grid max-w-[1460px] grid-cols-[280px_minmax(0,1fr)] gap-4">
        <aside className="self-start rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#A63D48]">
                Optimizasyon
              </p>
              <h2 className="mt-1 text-[15px] font-black text-slate-950">
                Hedef profilleri
              </h2>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => loadProfile(null)}
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[9px] font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                + Yeni
              </button>
            )}
          </div>

          <p className="mt-2 text-[10px] font-medium leading-5 text-slate-500">
            Partisyon hangi hedefin daha önemli olduğuna kendiliğinden karar vermez. Yalnız burada
            açıkça belirlediğiniz öncelikleri kullanır.
          </p>

          <div className="mt-4 space-y-2">
            {data.profiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[10px] font-semibold leading-5 text-slate-500">
                Henüz profil yok. Bir profil oluşturup hangi hedeflerin önemli olduğunu siz belirleyin.
              </div>
            ) : (
              data.profiles.map((profile) => {
                const selected = profile.id === selectedProfileId;
                const meta = statusMeta(profile.status);

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => loadProfile(profile)}
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
                      {Object.values(profile.weights).filter((value) => value > 0).length} etkin hedef
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Program çözümleme hazırlığı
                </p>
                <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                  Kurumun önceliklerini tanımlayın
                </h1>
                <p className="mt-2 max-w-3xl text-[10px] font-medium leading-5 text-slate-600">
                  Zorunlu kurallar programın geçerli olup olmadığını belirler. Buradaki hedefler ise
                  birden fazla geçerli çözüm arasından hangisinin tercih edileceğini tanımlar.
                  Öncelik düzeyleri yalnız birbirine göre anlam taşır; tek başına kalite puanı değildir.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1.5 text-[9px] font-black ${
                  hardReady
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}>
                  {hardReady ? 'Zorunlu kurallar hazır' : 'Zorunlu kural verileri eksik'}
                </span>
                <span className={`rounded-full px-3 py-1.5 text-[9px] font-black ${
                  objectiveReady
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {objectiveReady ? 'Etkin hedef profili hazır' : 'Etkin hedef profili yok'}
                </span>
              </div>
            </div>

            {unknownRooms && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3">
                <p className="text-[10px] font-black text-blue-950">
                  {unknownRooms.count} dersin salon bilgisi henüz kesin değil
                </p>
                <p className="mt-1 text-[9px] font-medium leading-4 text-blue-800">
                  Bu durum çözüm aramayı engellemiyor. {unknownRooms.withBaselineRoomEvidence ?? 0} derste
                  mevcut programda kullanılan bir salon var; {unknownRooms.withoutBaselineRoomEvidence ?? 0} derste
                  salon henüz belirlenmemiş. Partisyon bu geçici bilgileri kendiliğinden sabit salon kuralına çevirmiyor.
                </p>
              </div>
            )}

            {feasibilityResult?.changedCards && feasibilityResult.changedCards.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black text-amber-950">
                      Kontrol için {feasibilityResult.changedCards.length} ders kartında farklı yerleşim gerekti
                    </p>
                    <p className="mt-1 max-w-4xl text-[9px] font-medium leading-4 text-amber-800">
                      Aşağıdaki karşılaştırma yalnızca açıklama amaçlıdır; programa hiçbir değişiklik uygulanmadı.
                      Etiketler mevcut yerleşimin neden aynen korunamadığını gösterir.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[8px] font-black text-amber-700">
                    {feasibilityResult.baselineIssues?.length ?? 0} mevcut program uyarısı
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
                            {item.groupName} · {item.subjectName} · Blok {item.blockIndex}
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
                            Geçici çözüm: {placementSummary(
                              item.proposed.dayOfWeek,
                              item.proposed.startPeriod,
                              item.proposed.teacherName,
                              item.proposed.roomName,
                            )}
                          </p>
                        </div>
                      </div>

                      {item.baselineIssueCodes.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.baselineIssueCodes.map((code) => (
                            <span
                              key={code}
                              className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black text-amber-800"
                              title={code}
                            >
                              {BASELINE_ISSUE_LABELS[code] ?? code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[8px] font-bold text-slate-400">
                          Bu kartın kendi üzerinde doğrudan bir kural ihlali yok; başka bir zorunlu çakışmayı çözmek için geçici çözümde taşındı.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#A63D48]">
                  Program uygunluk denetimi
                </p>
                <h2 className="mt-1 text-[15px] font-black text-slate-950">
                  Program zorunlu kurallara uygun mu?
                </h2>
                <p className="mt-2 text-[10px] font-medium leading-5 text-slate-600">
                  Bu denetim programın anlık kopyasını tarayıcı belleğinde inceler ve bütün dersler için
                  geçerli bir yerleşim bulunup bulunamadığını kontrol eder. Veritabanına yerleşim yazmaz,
                  mevcut programı değiştirmez ve tercih hedeflerine göre seçim yapmaz.
                </p>
              </div>

              <button
                type="button"
                onClick={runFeasibility}
                disabled={!hardReady || feasibilityBusy}
                className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {feasibilityBusy ? 'Kontrol ediliyor…' : 'Uygunluğu kontrol et'}
              </button>
            </div>

            {!hardReady && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-bold text-rose-700">
                Zorunlu kural verileri hazır olmadığı için uygunluk denetimi çalıştırılamıyor.
              </div>
            )}

            {feasibilityResult && (
              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(110px,auto))] gap-2">
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
                      ? 'Geçerli yerleşim bulundu'
                      : feasibilityResult.status === 'SEARCH_LIMIT'
                        ? 'Arama sınırına ulaşıldı'
                        : 'Geçerli yerleşim bulunamadı'}
                  </p>
                  <p className="mt-1 text-[9px] font-medium leading-4 text-slate-600">
                    {feasibilityResult.status === 'FEASIBLE' && feasibilityResult.baselineWasFeasible
                      ? 'Mevcut program zorunlu kurallar açısından zaten geçerli.'
                      : feasibilityResult.status === 'FEASIBLE'
                        ? 'Denetim, yalnız geçici bellekte farklı bir geçerli yerleşim buldu.'
                        : feasibilityResult.reasons.join(' · ')}
                  </p>
                  <p className="mt-2 text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Program değişmedi · veritabanına yazılmadı
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Mevcut yerleşim korundu
                  </p>
                  <p className="mt-1 text-[14px] font-black text-slate-900">
                    {feasibilityResult.metrics.baselineReuseCount}/{feasibilityResult.metrics.cardCount}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                    İncelenen seçenek
                  </p>
                  <p className="mt-1 text-[14px] font-black text-slate-900">
                    {feasibilityResult.metrics.visitedNodeCount}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Salonu belirsiz kart
                  </p>
                  <p className="mt-1 text-[14px] font-black text-slate-900">
                    {feasibilityResult.metrics.provisionalRoomCount}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-4">
              <label className="block">
                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Profil adı
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canEdit || busy}
                  placeholder="Örn. Dönem programı — dengeli"
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
                      ? statusMeta(selectedProfile.status).label
                      : 'Yeni profil'}
                  </span>
                </div>
              </div>
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Açıklama · isteğe bağlı
              </span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canEdit || busy}
                placeholder="Bu profil hangi program yaklaşımı için kullanılacak?"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white disabled:opacity-50"
              />
            </label>
          </section>

          <div className="grid grid-cols-2 gap-3">
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
                        onClick={() => setWeights((value) => ({
                          ...value,
                          [objective.key]: level.value,
                        }))}
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

          <section className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-4">
            <p className="text-[10px] font-black text-slate-700">
              Henüz etkinleştirilemeyen hedefler
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[9px] font-black text-slate-700">Öğretmen yük dengesi</p>
                <p className="mt-1 text-[8px] font-medium leading-4 text-slate-400">
                  Öğretmen bazlı minimum / hedef / maksimum ders yükleri tanımlandıktan sonra açılacak.
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[9px] font-black text-slate-700">Ders-saat tercihleri</p>
                <p className="mt-1 text-[8px] font-medium leading-4 text-slate-400">
                  Ders bazlı tercih edilen veya kaçınılan gün-saat kuralları tanımlandıktan sonra açılacak.
                </p>
              </div>
            </div>
          </section>

          {localError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-bold text-rose-700">
              {localError}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-[10px] font-black text-slate-800">
                {positiveObjectiveCount} hedef açık
              </p>
              <p className="mt-1 text-[9px] font-medium text-slate-500">
                Etkin profil, çözüm aranırken hangi hedeflerin daha önemli olduğunu belirleyecek.
                Program bu ekranda değiştirilmez.
              </p>
            </div>

            {canEdit ? (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void save(selectedProfile?.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT')}
                  disabled={busy || name.trim().length === 0}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  {selectedProfile?.status === 'ACTIVE'
                    ? 'Değişiklikleri kaydet'
                    : 'Taslak kaydet'}
                </button>
                <button
                  type="button"
                  onClick={() => void save('ACTIVE')}
                  disabled={!canActivate}
                  className="rounded-xl bg-[#A63D48] px-4 py-2.5 text-[10px] font-black text-white hover:bg-[#8F3340] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Etkin profil yap
                </button>
              </div>
            ) : (
              <span className="text-[10px] font-semibold text-slate-400">
                Salt okunur
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
