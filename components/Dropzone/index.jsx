import { useDropzone } from 'react-dropzone';
import styles from './dropzone.module.scss';


export default function Dropzone(props) {
    const {acceptedFiles, getRootProps, getInputProps} = useDropzone({
        onDrop: props.onDrop
    });
  
  const files = acceptedFiles.map(file => (
    <li key={file.path}>
      {file.path} - {file.size} bytes
    </li>
  ));
  

  return (
    <section className={styles.container}>
      <div {...getRootProps({className: styles.dropzone})}>
        <input {...getInputProps()} />
        <p>Drag 'n' drop some files here, or click to select files</p>
      </div>
    </section>
  );
}