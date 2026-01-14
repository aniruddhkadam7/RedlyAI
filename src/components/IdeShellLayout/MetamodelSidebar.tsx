import React from 'react';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import CustomMetaModelEditor from './CustomMetaModelEditor';
import MetamodelTree from './MetamodelTree';

const MetamodelSidebar: React.FC = () => {
  const { metadata } = useEaRepository();

  if (metadata?.referenceFramework === 'Custom') {
    return (
      <div>
        <CustomMetaModelEditor />
        <MetamodelTree />
      </div>
    );
  }

  return <MetamodelTree />;
};

export default MetamodelSidebar;
