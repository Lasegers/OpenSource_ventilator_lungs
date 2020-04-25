import React from 'react';

import Icon from './icon-base';

const GraphIcon = ({ ...props }) => {
    props.viewboxWidth = 24;
    props.viewboxHeight = 24;

    return (
        <Icon { ...props }>
            <path d="M3 19h18v2H3zm3-3c1.1 0 2-.9 2-2c0-.5-.2-1-.5-1.3L8.8 10H9c.5 0 1-.2 1.3-.5l2.7 1.4v.1c0 1.1.9 2 2 2s2-.9 2-2c0-.5-.2-.9-.5-1.3L17.8 7h.2c1.1 0 2-.9 2-2s-.9-2-2-2s-2 .9-2 2c0 .5.2 1 .5 1.3L15.2 9H15c-.5 0-1 .2-1.3.5L11 8.2V8c0-1.1-.9-2-2-2s-2 .9-2 2c0 .5.2 1 .5 1.3L6.2 12H6c-1.1 0-2 .9-2 2s.9 2 2 2z" />
        </Icon>
    );
};

export default GraphIcon;
