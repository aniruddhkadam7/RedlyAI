// ─── Upload Step ──────────────────────────────────────────────────────────
// File upload with drag & drop support.

import { InboxOutlined } from '@ant-design/icons';
import { Alert, Typography, Upload } from 'antd';
import React from 'react';
import styles from '../import.module.less';

type UploadStepProps = {
  loading: boolean;
  error: string | null;
  onUpload: (fileName: string, content: string) => void;
};

const { Dragger } = Upload;

const UploadStep: React.FC<UploadStepProps> = ({
  loading,
  error,
  onUpload,
}) => {
  const handleFile = React.useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        if (typeof content === 'string') {
          onUpload(file.name, content);
        }
      };
      reader.readAsText(file);
      return false; // Prevent antd default upload.
    },
    [onUpload],
  );

  return (
    <div className={styles.stepContent}>
      <Typography.Title level={5}>Upload CSV File</Typography.Title>
      <Typography.Text type="secondary">
        Select a CSV file containing application data. The file should have a
        header row with column names.
      </Typography.Text>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          className={styles.stepAlert}
        />
      )}

      <Dragger
        accept=".csv,.tsv,.txt"
        showUploadList={false}
        beforeUpload={handleFile}
        disabled={loading}
        className={styles.dragger}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Click or drag a CSV file to this area</p>
        <p className="ant-upload-hint">
          Supports single CSV file upload. Maximum 10,000+ records.
        </p>
      </Dragger>
    </div>
  );
};

export default UploadStep;
