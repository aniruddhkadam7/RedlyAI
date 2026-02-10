// ─── CSV Import Page ──────────────────────────────────────────────────────
// Enterprise-grade CSV import for Application Catalog.
// Uses a stepped wizard: Upload → Mapping → Validation → Duplicates → Summary.

import { ArrowLeftOutlined, HistoryOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import { Button, Steps, Typography } from 'antd';
import React from 'react';
import DuplicateStep from '../components/DuplicateStep';
import ImportHistoryModal from '../components/ImportHistoryModal';
import MappingStep from '../components/MappingStep';
import SummaryStep from '../components/SummaryStep';
import UploadStep from '../components/UploadStep';
import ValidationStep from '../components/ValidationStep';
import { useImportController } from '../hooks/useImportController';
import styles from '../import.module.less';
import type { ImportStep } from '../types/import.types';
import { IMPORT_STEPS } from '../types/import.types';

const STEP_INDEX: Record<ImportStep, number> = {
  upload: 0,
  mapping: 1,
  validation: 2,
  duplicates: 3,
  summary: 4,
};

const CsvImportPage: React.FC = () => {
  const {
    state,
    uploadCsv,
    updateMapping,
    confirmMappings,
    proceedFromValidation,
    updateDuplicateStrategy,
    proceedFromDuplicates,
    runImport,
    goToStep,
    reset,
  } = useImportController();

  const [historyOpen, setHistoryOpen] = React.useState(false);

  const goToCatalog = React.useCallback(() => {
    history.push('/catalog/application');
  }, []);

  const goBack = React.useCallback(() => {
    history.push('/catalog/application');
  }, []);

  const currentStepIndex = STEP_INDEX[state.currentStep];

  return (
    <div className={styles.importPage}>
      {/* Header */}
      <div className={styles.importHeader}>
        <div className={styles.importHeaderTitle}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={goBack} />
          <Typography.Text strong>CSV Import — Applications</Typography.Text>
        </div>
        <Button icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
          Import History
        </Button>
      </div>

      {/* Body */}
      <div className={styles.importBody}>
        {/* Stepper */}
        <div className={styles.stepperContainer}>
          <Steps
            current={currentStepIndex}
            size="small"
            items={IMPORT_STEPS.map((step, index) => ({
              title: step.title,
              status:
                index < currentStepIndex
                  ? 'finish'
                  : index === currentStepIndex
                    ? 'process'
                    : 'wait',
            }))}
          />
        </div>

        {/* Step Content */}
        {state.currentStep === 'upload' && (
          <UploadStep
            loading={state.loading}
            error={state.error}
            onUpload={uploadCsv}
          />
        )}

        {state.currentStep === 'mapping' && (
          <MappingStep
            csvHeaders={state.csvHeaders}
            csvPreview={state.csvPreview}
            mappings={state.mappings}
            targetFields={state.targetFields}
            totalRows={state.totalRows}
            loading={state.loading}
            error={state.error}
            onUpdateMapping={updateMapping}
            onConfirm={confirmMappings}
            onBack={() => goToStep('upload')}
          />
        )}

        {state.currentStep === 'validation' && (
          <ValidationStep
            validRecords={state.validRecords}
            invalidRecords={state.invalidRecords}
            duplicateRecords={state.duplicateRecords}
            validCount={state.validCount}
            invalidCount={state.invalidCount}
            duplicateCount={state.duplicateCount}
            error={state.error}
            onProceed={proceedFromValidation}
            onBack={() => goToStep('mapping')}
          />
        )}

        {state.currentStep === 'duplicates' && (
          <DuplicateStep
            duplicateRecords={state.duplicateRecords}
            duplicateMatches={state.duplicateMatches}
            onUpdateStrategy={updateDuplicateStrategy}
            onProceed={proceedFromDuplicates}
            onBack={() => goToStep('validation')}
          />
        )}

        {state.currentStep === 'summary' && (
          <SummaryStep
            validCount={state.validCount}
            invalidCount={state.invalidCount}
            duplicateRecords={state.duplicateRecords}
            loading={state.loading}
            error={state.error}
            importResult={state.importResult}
            onExecute={runImport}
            onBack={() =>
              goToStep(state.duplicateCount > 0 ? 'duplicates' : 'validation')
            }
            onReset={reset}
            onGoToCatalog={goToCatalog}
          />
        )}
      </div>

      {/* History Modal */}
      <ImportHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
};

export default CsvImportPage;
