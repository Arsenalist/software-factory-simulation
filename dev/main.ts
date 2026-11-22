// Dev harness only: stands in for zarar.dev's fonts, variables and graph paper. Not part of the bundle.
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/fraunces/full.css';
import './site.css';
import { mount } from '../src/index';
mount(document.getElementById('software-factory')!);
